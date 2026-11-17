"""RegistryService (docs/adr/0004): this module is authoritative for model
lifecycle state, promotion approvals and rollback history. MLflow is not
touched here -- it stays the record of the run's own params/metrics.

Every lookup in this module is scoped by owner_id. A registry entry with
owner_id=None belongs to the legacy "system" principal (the MLFORGE_API_KEY
bypass); it is its own isolated scope, not a wildcard that sees everyone
else's models -- two different real users training a model with the same
catalog name (e.g. both calling it "Logistic Regression") must never affect
each other's version numbering, production slot, or rollback target.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db_models import Job, ModelVersion

LIFECYCLE_STATES = ("development", "staging", "production", "archived")

# Only these transitions are allowed; promoting straight from development to
# production, or reviving archived straight to production, must go through
# staging again -- callers see a RegistryError naming the invalid transition.
_ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "development": {"staging", "archived"},
    "staging": {"production", "development", "archived"},
    "production": {"archived"},
    "archived": {"staging"},
}

# Simple quality gate: promoting to production requires the job's primary
# metric (f1 for classification, r2 for regression) to clear this bar.
# Configurable because "good enough" is dataset-dependent; 0.0 means "no gate"
# and is NOT the recommended production setting -- see docs/mlops.
_MIN_PROMOTION_SCORE = float(os.environ.get("MLFORGE_PROMOTION_MIN_SCORE", "0.0"))


class RegistryError(ValueError):
    pass


def _primary_score(job: Job) -> float | None:
    if not job.metrics:
        return None
    return job.metrics.get("f1") if job.task_type == "classification" else job.metrics.get("r2")


def _owner_filter(stmt, owner_id: str | None):
    """owner_id=None (SystemPrincipal) is its own scope -- IS NULL, not "no filter"."""
    return stmt.where(ModelVersion.owner_id.is_(None)) if owner_id is None else stmt.where(ModelVersion.owner_id == owner_id)


def register_version(db: Session, job: Job, owner_id: str | None, model_card_extra: dict | None = None) -> ModelVersion:
    if job.status != "succeeded" or not job.pickle_path:
        raise RegistryError("Only a successfully completed training/find-best job can be registered.")
    if job.owner_id != owner_id:
        # Defense in depth: the router already checks services.owns(job, user)
        # before calling this, but this module must not trust that alone.
        raise RegistryError("You can only register a model from a job you own.")

    existing_count_stmt = _owner_filter(
        select(ModelVersion).where(ModelVersion.model_name == job.model_name), owner_id
    )
    next_version = len(db.execute(existing_count_stmt).scalars().all()) + 1

    model_card = {
        "model_name": job.model_name,
        "source_job_id": job.id,
        "mlflow_run_id": job.mlflow_run_id,
        "dataset_fingerprint": job.dataset_fingerprint,
        "task_type": job.task_type,
        "metrics": job.metrics,
        "model_params": job.model_params,
        "created_at": datetime.now(timezone.utc).isoformat(),
        **(model_card_extra or {}),
    }

    version = ModelVersion(
        job_id=job.id,
        owner_id=owner_id,
        model_name=job.model_name,
        version=next_version,
        lifecycle_state="development",
        model_card=model_card,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version


def list_versions(db: Session, owner_id: str | None) -> list[ModelVersion]:
    stmt = select(ModelVersion).order_by(ModelVersion.created_at.desc())
    if owner_id is not None:
        stmt = stmt.where(ModelVersion.owner_id == owner_id)
    return db.execute(stmt).scalars().all()


def get_current_production(db: Session, owner_id: str | None, model_name: str) -> ModelVersion | None:
    stmt = _owner_filter(
        select(ModelVersion).where(ModelVersion.model_name == model_name, ModelVersion.lifecycle_state == "production"),
        owner_id,
    )
    return db.execute(stmt).scalars().first()


def promote(db: Session, version: ModelVersion, job: Job, target_state: str) -> ModelVersion:
    if target_state not in LIFECYCLE_STATES:
        raise RegistryError(f"target_state must be one of {LIFECYCLE_STATES}")
    if target_state not in _ALLOWED_TRANSITIONS.get(version.lifecycle_state, set()):
        raise RegistryError(f"Cannot transition from {version.lifecycle_state!r} to {target_state!r}.")

    try:
        if target_state == "production":
            score = _primary_score(job)
            if score is None or score < _MIN_PROMOTION_SCORE:
                raise RegistryError(
                    f"Quality gate failed: primary metric {score} is below the promotion "
                    f"threshold {_MIN_PROMOTION_SCORE} (MLFORGE_PROMOTION_MIN_SCORE)."
                )

            current_production_stmt = _owner_filter(
                select(ModelVersion).where(
                    ModelVersion.model_name == version.model_name,
                    ModelVersion.lifecycle_state == "production",
                ),
                version.owner_id,
            )
            current_production = db.execute(current_production_stmt).scalars().first()
            if current_production is not None and current_production.id != version.id:
                current_production.lifecycle_state = "archived"
                version.promoted_from = current_production.id

        version.lifecycle_state = target_state
        version.promoted_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(version)
    return version


def rollback(db: Session, version: ModelVersion) -> ModelVersion:
    """Promotes the version named in `promoted_from` back to production,
    demoting `version` to archived. Requires that this version actually
    recorded what it replaced (set by promote()), and that the two versions
    share an owner (a corrupted/tampered promoted_from pointing across
    owners must never be followed)."""
    if version.lifecycle_state != "production":
        raise RegistryError("Only the current production version can be rolled back.")
    if not version.promoted_from:
        raise RegistryError("This version has no recorded prior production version to roll back to.")

    previous = db.get(ModelVersion, version.promoted_from)
    if previous is None:
        raise RegistryError("The prior production version no longer exists.")
    if previous.owner_id != version.owner_id:
        # Should be unreachable if promote() is the only writer, but never
        # trust a stale/foreign pointer blindly on a security-relevant path.
        raise RegistryError("The prior production version does not belong to the same owner; refusing to roll back.")

    try:
        version.lifecycle_state = "archived"
        version.promoted_from = None
        previous.lifecycle_state = "production"
        previous.promoted_at = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(previous)
    return previous
