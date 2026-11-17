"""RegistryService (docs/adr/0004): this module is authoritative for model
lifecycle state, promotion approvals and rollback history. MLflow is not
touched here -- it stays the record of the run's own params/metrics."""
from __future__ import annotations

import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db_models import Job, ModelVersion

LIFECYCLE_STATES = ("development", "staging", "production", "archived")

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


def register_version(db: Session, job: Job, owner_id: str | None, model_card_extra: dict | None = None) -> ModelVersion:
    if job.status != "succeeded" or not job.pickle_path:
        raise RegistryError("Only a successfully completed training/find-best job can be registered.")

    existing_count = db.execute(
        select(ModelVersion).where(ModelVersion.model_name == job.model_name)
    ).scalars().all()
    next_version = len(existing_count) + 1

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


def promote(db: Session, version: ModelVersion, job: Job, target_state: str) -> ModelVersion:
    if target_state not in LIFECYCLE_STATES:
        raise RegistryError(f"target_state must be one of {LIFECYCLE_STATES}")

    if target_state == "production":
        score = _primary_score(job)
        if score is None or score < _MIN_PROMOTION_SCORE:
            raise RegistryError(
                f"Quality gate failed: primary metric {score} is below the promotion "
                f"threshold {_MIN_PROMOTION_SCORE} (MLFORGE_PROMOTION_MIN_SCORE)."
            )

        current_production = db.execute(
            select(ModelVersion).where(
                ModelVersion.model_name == version.model_name,
                ModelVersion.lifecycle_state == "production",
            )
        ).scalars().first()
        if current_production is not None and current_production.id != version.id:
            current_production.lifecycle_state = "archived"
            version.promoted_from = current_production.id

    version.lifecycle_state = target_state
    version.promoted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(version)
    return version


def rollback(db: Session, version: ModelVersion) -> ModelVersion:
    """Promotes the version named in `promoted_from` back to production,
    demoting `version` to archived. Requires that this version actually
    recorded what it replaced (set by promote())."""
    if not version.promoted_from:
        raise RegistryError("This version has no recorded prior production version to roll back to.")

    previous = db.get(ModelVersion, version.promoted_from)
    if previous is None:
        raise RegistryError("The prior production version no longer exists.")

    version.lifecycle_state = "archived"
    previous.lifecycle_state = "production"
    previous.promoted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(previous)
    return previous
