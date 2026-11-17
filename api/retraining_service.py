"""RetrainingService (Phase 4 -- controlled automation).

This module never promotes anything on its own. It only ever reaches
production through registry_service.register_version()/promote(), and
only inside approve(), which is called exclusively from an explicit human
action (api/routers/retraining.py). Nothing in this module runs on a
schedule or reacts automatically to a drift alert without that alert
first being handed to generate_from_drift() by an explicit caller -- see
docs/adr/0004 (registry is the sole lifecycle authority) and
docs/backlog.md (scheduled retraining is explicitly out of scope).
"""
from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from api import registry_service, services
from api.db_models import Job, ModelVersion, MonitoringSnapshot, RetrainingCandidate
from api.monitoring_service import is_alertable


class RetrainingError(ValueError):
    pass


def _owner_filter(stmt, owner_id: str | None):
    return stmt.where(RetrainingCandidate.owner_id.is_(None)) if owner_id is None else stmt.where(
        RetrainingCandidate.owner_id == owner_id
    )


def _champion_score(champion: ModelVersion) -> float | None:
    card = champion.model_card or {}
    metrics = card.get("metrics") or {}
    return metrics.get("f1") if card.get("task_type") == "classification" else metrics.get("r2")


def trigger_manual_retraining(db: Session, source_version: ModelVersion, owner_id: str | None, triggered_by: str | None) -> RetrainingCandidate:
    """Subphase 4A: reuse source_version's original job config/dataset to
    start a new training run, wrapped in a candidate. The champion is
    whatever is currently in production for this model_name -- untouched."""
    source_job = db.get(Job, source_version.job_id)
    if source_job is None:
        raise RetrainingError("The source model version's training job no longer exists.")
    if not source_job.dataset_filename:
        raise RetrainingError("The original training dataset for this model is unavailable; cannot retrain.")

    dataset_path = services.upload_path(source_job.dataset_filename)
    try:
        df = pd.read_csv(dataset_path)
    except FileNotFoundError:
        raise RetrainingError("The original training dataset file is no longer on disk; cannot retrain.")

    new_job = services.create_job(
        db,
        job_type="train",
        status="running",
        owner_id=owner_id,
        dataset_filename=source_job.dataset_filename,
        dataset_fingerprint=source_job.dataset_fingerprint,
        model_name=source_job.model_name,
        input_cols=source_job.input_cols,
        target_col=source_job.target_col,
        task_type=source_job.task_type,
        model_params=source_job.model_params,
    )
    new_job = services.run_train_job(db, new_job, df, source_job.model_params or {})

    candidate = RetrainingCandidate(
        owner_id=owner_id,
        model_name=source_job.model_name,
        source="manual",
        reason=f"Manual retraining triggered from model version {source_version.id}",
        job_id=new_job.id,
        triggered_by=triggered_by,
        status="pending",
    )
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def evaluate_candidate(db: Session, candidate: RetrainingCandidate) -> RetrainingCandidate:
    """Subphase 4B: compare the candidate's job metrics against the current
    production champion (if any) and the same quality gate promote() uses.
    Re-evaluating an already-decided candidate is refused -- evaluation is
    not meant to be replayed after a human has acted on it."""
    if candidate.decision is not None:
        raise RetrainingError("This candidate has already been decided; it cannot be re-evaluated.")

    job = db.get(Job, candidate.job_id)
    if job is None:
        raise RetrainingError("The candidate's training job no longer exists.")
    if job.status != "succeeded":
        raise RetrainingError(f"Candidate's training job has not succeeded (status={job.status!r}); nothing to evaluate yet.")

    champion = registry_service.get_current_production(db, candidate.owner_id, candidate.model_name)
    candidate_score = registry_service._primary_score(job)
    champion_score = _champion_score(champion) if champion else None

    min_promotion_score = registry_service._MIN_PROMOTION_SCORE  # read dynamically, not copied at import time
    gate_passed = candidate_score is not None and candidate_score >= min_promotion_score
    beats_champion = champion is None or (champion_score is not None and candidate_score is not None and candidate_score > champion_score)

    passed = bool(gate_passed and beats_champion)
    if not gate_passed:
        gate_reason = f"Primary metric {candidate_score} is below the promotion threshold {min_promotion_score}."
    elif not beats_champion:
        gate_reason = f"Candidate score {candidate_score} does not exceed champion score {champion_score}."
    else:
        gate_reason = "Candidate clears the quality gate and outperforms the current champion." if champion else "Candidate clears the quality gate; no current champion to compare against."

    evaluation = {
        "candidate_score": candidate_score,
        "champion_score": champion_score,
        "champion_version_id": champion.id if champion else None,
        "gate_threshold": min_promotion_score,
        "passed": passed,
        "reason": gate_reason,
    }

    candidate.evaluation = evaluation
    candidate.evaluated_at = datetime.now(timezone.utc)
    candidate.evaluated_champion_version_id = champion.id if champion else None

    if passed:
        candidate.status = "evaluated"
    else:
        candidate.status = "rejected"
        candidate.decision = "rejected"
        candidate.decision_reason = f"Automatic rejection: {gate_reason}"
        candidate.decided_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(candidate)
    return candidate


def generate_from_drift(db: Session, snapshot: MonitoringSnapshot, owner_id: str | None, model_name: str, source_version: ModelVersion, triggered_by: str | None) -> RetrainingCandidate:
    """Subphase 4C. Returns the existing candidate unchanged if one was
    already generated for this snapshot (never duplicates)."""
    existing = db.execute(
        select(RetrainingCandidate).where(RetrainingCandidate.monitoring_snapshot_id == snapshot.id)
    ).scalars().first()
    if existing is not None:
        return existing

    if not is_alertable(snapshot):
        raise RetrainingError("This monitoring snapshot does not meet the drift-alert threshold; no candidate generated.")

    candidate = trigger_manual_retraining(db, source_version, owner_id, triggered_by)
    candidate.source = "drift"
    candidate.monitoring_snapshot_id = snapshot.id
    candidate.reason = (
        f"Drift-triggered: monitoring snapshot {snapshot.id} flagged "
        f"drift_share={snapshot.drift_share} (drift_detected={snapshot.drift_detected})"
    )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(candidate)
    return candidate


def approve_candidate(db: Session, candidate: RetrainingCandidate, decided_by: str | None, reason: str | None) -> RetrainingCandidate:
    """Subphase 4D. The ONLY path in this codebase that can take a
    retraining candidate to production -- and it only runs when this
    function is called, i.e. in response to an explicit API request from
    an authorized human. Re-reads candidate.status fresh inside this call
    (the caller already holds the row from its own query, but SQLite/
    PostgreSQL both serialize writers at the transaction level, so a
    concurrent second approve() attempt on the same id blocks until the
    first commits, then sees the updated status and is rejected below --
    no separate optimistic-lock column needed at this scale)."""
    db.refresh(candidate)
    if candidate.decision is not None:
        raise RetrainingError(f"This candidate was already {candidate.decision}; it cannot be decided again.")
    if candidate.status != "evaluated":
        raise RetrainingError(f"Candidate status is {candidate.status!r}; only an 'evaluated' (passed) candidate can be approved.")

    current_champion = registry_service.get_current_production(db, candidate.owner_id, candidate.model_name)
    current_champion_id = current_champion.id if current_champion else None
    if current_champion_id != candidate.evaluated_champion_version_id:
        raise RetrainingError(
            "The production champion has changed since this candidate was evaluated "
            f"(evaluated against {candidate.evaluated_champion_version_id!r}, current is {current_champion_id!r}). "
            "Re-evaluate before approving."
        )

    job = db.get(Job, candidate.job_id)
    if job is None:
        raise RetrainingError("The candidate's training job no longer exists.")

    version = None
    try:
        # Register and promote in a single transactional boundary (commit=False)
        # so that any failure before final production promotion leaves no
        # orphaned development or staging version in the registry.
        version = registry_service.register_version(
            db, job, candidate.owner_id, model_card_extra={"retraining_candidate_id": candidate.id}, commit=False
        )
        version = registry_service.promote(db, version, job, "staging", commit=False)
        version = registry_service.promote(db, version, job, "production", commit=False)

        candidate.decision = "approved"
        candidate.decision_reason = reason
        candidate.decided_by = decided_by
        candidate.decided_at = datetime.now(timezone.utc)
        candidate.status = "approved"
        candidate.promoted_version_id = version.id
        db.commit()
        db.refresh(version)
    except registry_service.RegistryError as exc:
        db.rollback()
        # Compensating rollback: if the version record was flushed or created,
        # ensure it is completely purged from the registry to avoid orphans.
        if version is not None and getattr(version, "id", None):
            orphan = db.get(ModelVersion, version.id)
            if orphan is not None:
                db.delete(orphan)
                db.commit()

        cand = db.get(RetrainingCandidate, candidate.id)
        if cand is not None:
            cand.status = "promotion_failed"
            cand.decision_reason = f"Approved but promotion failed: {exc}"
            db.commit()
            db.refresh(cand)
            candidate = cand
        raise RetrainingError(str(exc)) from exc
    except Exception:
        db.rollback()
        if version is not None and getattr(version, "id", None):
            orphan = db.get(ModelVersion, version.id)
            if orphan is not None:
                db.delete(orphan)
                db.commit()
        raise
    db.refresh(candidate)
    return candidate


def reject_candidate(db: Session, candidate: RetrainingCandidate, decided_by: str | None, reason: str | None) -> RetrainingCandidate:
    """Never touches the registry or production -- rejection is always safe."""
    db.refresh(candidate)
    if candidate.decision is not None:
        raise RetrainingError(f"This candidate was already {candidate.decision}; it cannot be decided again.")

    candidate.decision = "rejected"
    candidate.decision_reason = reason
    candidate.decided_by = decided_by
    candidate.decided_at = datetime.now(timezone.utc)
    candidate.status = "rejected"
    db.commit()
    db.refresh(candidate)
    return candidate


def list_candidates(db: Session, owner_id: str | None) -> list[RetrainingCandidate]:
    stmt = _owner_filter(select(RetrainingCandidate).order_by(RetrainingCandidate.created_at.desc()), owner_id)
    return db.execute(stmt).scalars().all()
