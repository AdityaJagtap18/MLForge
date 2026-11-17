from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api import retraining_service, services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Deployment, Job, ModelVersion, MonitoringSnapshot, RetrainingCandidate
from api.schemas import GenerateCandidateRequest, RetrainingCandidateResponse, RetrainingDecisionRequest

router = APIRouter(prefix="/retraining", tags=["retraining"], dependencies=[Depends(require_auth_if_configured)])


def _owner_id(current_user) -> str | None:
    return None if current_user.id == "system" else current_user.id


def _get_owned_version(db: Session, version_id: str, current_user) -> ModelVersion:
    version = db.get(ModelVersion, version_id)
    if version is None or (current_user.id != "system" and version.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Model version not found.")
    return version


def _get_owned_candidate(db: Session, candidate_id: str, current_user) -> RetrainingCandidate:
    candidate = db.get(RetrainingCandidate, candidate_id)
    if candidate is None or (current_user.id != "system" and candidate.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Retraining candidate not found.")
    return candidate


@router.post("/trigger", response_model=RetrainingCandidateResponse)
def trigger(body: GenerateCandidateRequest, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Subphase 4A: manual retraining for an existing registered model."""
    version = _get_owned_version(db, body.model_version_id, current_user)
    try:
        return retraining_service.trigger_manual_retraining(db, version, _owner_id(current_user), current_user.id)
    except retraining_service.RetrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/from-snapshot/{snapshot_id}", response_model=RetrainingCandidateResponse)
def from_snapshot(snapshot_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Subphase 4C: drift-triggered candidate generation. Idempotent -- a
    second call for the same snapshot returns the existing candidate."""
    snapshot = db.get(MonitoringSnapshot, snapshot_id)
    if snapshot is None:
        raise HTTPException(status_code=404, detail="Monitoring snapshot not found.")

    deployment = db.get(Deployment, snapshot.deployment_id)
    if deployment is None or (current_user.id != "system" and deployment.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Monitoring snapshot not found.")

    version = db.get(ModelVersion, deployment.model_version_id)
    if version is None:
        raise HTTPException(status_code=400, detail="Deployed model version no longer exists.")

    try:
        return retraining_service.generate_from_drift(
            db, snapshot, _owner_id(current_user), deployment.model_name, version, current_user.id
        )
    except retraining_service.RetrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("", response_model=list[RetrainingCandidateResponse])
def list_candidates(db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    return retraining_service.list_candidates(db, _owner_id(current_user))


@router.get("/{candidate_id}", response_model=RetrainingCandidateResponse)
def get_candidate(candidate_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    return _get_owned_candidate(db, candidate_id, current_user)


@router.post("/{candidate_id}/evaluate", response_model=RetrainingCandidateResponse)
def evaluate(candidate_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Subphase 4B."""
    candidate = _get_owned_candidate(db, candidate_id, current_user)
    try:
        return retraining_service.evaluate_candidate(db, candidate)
    except retraining_service.RetrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{candidate_id}/approve", response_model=RetrainingCandidateResponse)
def approve(
    candidate_id: str,
    body: RetrainingDecisionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
):
    """Subphase 4D. The only path to production for a retraining candidate
    -- always an explicit, authorized, human-initiated call."""
    candidate = _get_owned_candidate(db, candidate_id, current_user)
    try:
        return retraining_service.approve_candidate(db, candidate, current_user.id, body.reason)
    except retraining_service.RetrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{candidate_id}/reject", response_model=RetrainingCandidateResponse)
def reject(
    candidate_id: str,
    body: RetrainingDecisionRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
):
    candidate = _get_owned_candidate(db, candidate_id, current_user)
    try:
        return retraining_service.reject_candidate(db, candidate, current_user.id, body.reason)
    except retraining_service.RetrainingError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{candidate_id}/audit")
def audit(candidate_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Resolves the full audit chain for one candidate:
    MonitoringSnapshot -> RetrainingCandidate -> Job -> Evaluation ->
    Approval/Rejection -> ModelVersion/Promotion. Manual candidates simply
    have monitoring_snapshot=None."""
    candidate = _get_owned_candidate(db, candidate_id, current_user)
    job = db.get(Job, candidate.job_id)
    snapshot = db.get(MonitoringSnapshot, candidate.monitoring_snapshot_id) if candidate.monitoring_snapshot_id else None
    champion = db.get(ModelVersion, candidate.evaluated_champion_version_id) if candidate.evaluated_champion_version_id else None
    promoted = db.get(ModelVersion, candidate.promoted_version_id) if candidate.promoted_version_id else None

    return {
        "candidate_id": candidate.id,
        "source": candidate.source,
        "reason": candidate.reason,
        "monitoring_snapshot": {
            "id": snapshot.id,
            "drift_type": snapshot.drift_type,
            "drift_detected": snapshot.drift_detected,
            "drift_share": snapshot.drift_share,
            "created_at": snapshot.created_at,
        }
        if snapshot
        else None,
        "training_job": {"id": job.id, "status": job.status, "metrics": job.metrics, "model_name": job.model_name} if job else None,
        "evaluation": candidate.evaluation,
        "evaluated_champion_version_id": candidate.evaluated_champion_version_id,
        "decision": {
            "decision": candidate.decision,
            "reason": candidate.decision_reason,
            "decided_by": candidate.decided_by,
            "decided_at": candidate.decided_at,
        },
        "promoted_version": {"id": promoted.id, "version": promoted.version, "lifecycle_state": promoted.lifecycle_state} if promoted else None,
        "status": candidate.status,
        "created_at": candidate.created_at,
        "triggered_by": candidate.triggered_by,
    }
