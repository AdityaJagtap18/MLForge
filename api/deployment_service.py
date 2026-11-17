"""DeploymentService (docs/adr/0005): models are served through FastAPI
directly. At most one Deployment is "active" per (owner_id, model_name);
deploying a new version replaces the old one (keeping history for
rollback), the same promote()/rollback() pattern registry_service.py uses.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session

from api.db_models import Deployment, ModelVersion, RequestLog

DEPLOYABLE_STATES = ("staging", "production")


class DeploymentError(ValueError):
    pass


def _owner_filter(stmt, owner_id: str | None):
    return stmt.where(Deployment.owner_id.is_(None)) if owner_id is None else stmt.where(Deployment.owner_id == owner_id)


def get_active_deployment(db: Session, owner_id: str | None, model_name: str) -> Deployment | None:
    stmt = _owner_filter(
        select(Deployment).where(Deployment.model_name == model_name, Deployment.status == "active"), owner_id
    )
    return db.execute(stmt).scalars().first()


def deploy(db: Session, version: ModelVersion, owner_id: str | None) -> Deployment:
    if version.lifecycle_state not in DEPLOYABLE_STATES:
        raise DeploymentError(
            f"Only versions in {DEPLOYABLE_STATES} can be deployed; this version is {version.lifecycle_state!r}."
        )

    try:
        current = get_active_deployment(db, owner_id, version.model_name)
        new_deployment = Deployment(model_version_id=version.id, owner_id=owner_id, model_name=version.model_name)
        db.add(new_deployment)
        db.flush()  # assign new_deployment.id before referencing it

        if current is not None:
            current.status = "replaced"
            current.stopped_at = datetime.now(timezone.utc)
            current.replaced_by = new_deployment.id

        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(new_deployment)
    return new_deployment


def rollback(db: Session, deployment: Deployment) -> Deployment:
    """Reactivates the deployment that `deployment` replaced. Requires
    `deployment` to currently be the active one for its slot."""
    if deployment.status != "active":
        raise DeploymentError("Only the currently active deployment can be rolled back.")

    previous = db.execute(
        select(Deployment).where(Deployment.replaced_by == deployment.id)
    ).scalars().first()
    if previous is None:
        raise DeploymentError("This deployment has no prior deployment recorded to roll back to.")
    if previous.owner_id != deployment.owner_id:
        raise DeploymentError("The prior deployment does not belong to the same owner; refusing to roll back.")

    try:
        deployment.status = "replaced"
        deployment.stopped_at = datetime.now(timezone.utc)
        deployment.replaced_by = None
        previous.status = "active"
        previous.stopped_at = None
        previous.replaced_by = None
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(previous)
    return previous


def stop(db: Session, deployment: Deployment) -> Deployment:
    if deployment.status != "active":
        raise DeploymentError("Only the currently active deployment can be stopped.")
    deployment.status = "stopped"
    deployment.stopped_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(deployment)
    return deployment


def list_deployments(db: Session, owner_id: str | None) -> list[Deployment]:
    stmt = select(Deployment).order_by(Deployment.created_at.desc())
    if owner_id is not None:
        stmt = stmt.where(Deployment.owner_id == owner_id)
    return db.execute(stmt).scalars().all()


def log_request(db: Session, deployment_id: str, *, success: bool, latency_ms: float, error_message: str | None = None) -> None:
    db.add(RequestLog(deployment_id=deployment_id, success=success, latency_ms=latency_ms, error_message=error_message))
    db.commit()


def deployment_metrics(db: Session, deployment_id: str) -> dict:
    """Request count, error rate, latency -- transformation prompt "Capture
    request count, latency, errors and model version"."""
    row = db.execute(
        select(
            func.count(RequestLog.id),
            func.sum(cast(RequestLog.success, Integer)),
            func.avg(RequestLog.latency_ms),
            func.max(RequestLog.latency_ms),
        ).where(RequestLog.deployment_id == deployment_id)
    ).one()
    request_count, success_count, avg_latency, max_latency = row
    request_count = request_count or 0
    success_count = success_count or 0
    return {
        "request_count": request_count,
        "error_count": request_count - success_count,
        "avg_latency_ms": round(avg_latency, 3) if avg_latency is not None else None,
        "max_latency_ms": round(max_latency, 3) if max_latency is not None else None,
    }
