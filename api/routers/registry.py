from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api import registry_service, services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Job, ModelVersion
from api.schemas import ChampionChallengerResponse, ModelVersionResponse, PromoteRequest

router = APIRouter(prefix="/registry", tags=["registry"], dependencies=[Depends(require_auth_if_configured)])


@router.post("/{job_id}/register", response_model=ModelVersionResponse)
def register(job_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    job = db.get(Job, job_id)
    if job is None or not services.owns(job, current_user):
        raise HTTPException(status_code=404, detail="Job not found.")
    try:
        owner_id = None if current_user.id == "system" else current_user.id
        return registry_service.register_version(db, job, owner_id)
    except registry_service.RegistryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("", response_model=list[ModelVersionResponse])
def list_versions(db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    owner_id = None if current_user.id == "system" else current_user.id
    return registry_service.list_versions(db, owner_id)


@router.get("/compare", response_model=ChampionChallengerResponse)
def compare(challenger_version_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Champion/challenger comparison (transformation prompt): the current
    production version for the challenger's model_name vs. the challenger
    itself. Read-only -- never promotes anything by itself."""
    challenger, _job = _get_owned_version(db, challenger_version_id, current_user)
    owner_id = None if current_user.id == "system" else current_user.id
    champion = registry_service.get_current_production(db, owner_id, challenger.model_name)

    if champion is None:
        recommendation = "No production champion exists yet for this model name; promote the challenger to evaluate it live."
    else:
        champion_score = (champion.model_card or {}).get("metrics", {})
        challenger_score = (challenger.model_card or {}).get("metrics", {})
        champion_primary = champion_score.get("f1", champion_score.get("r2"))
        challenger_primary = challenger_score.get("f1", challenger_score.get("r2"))
        if champion_primary is None or challenger_primary is None:
            recommendation = "Cannot compare: one or both versions are missing a primary metric."
        elif challenger_primary > champion_primary:
            recommendation = f"Challenger outperforms champion ({challenger_primary:.4f} > {champion_primary:.4f}) -- consider promoting."
        else:
            recommendation = f"Challenger does not outperform champion ({challenger_primary:.4f} <= {champion_primary:.4f}) -- keep current champion."

    return ChampionChallengerResponse(
        model_name=challenger.model_name,
        champion=champion,
        challenger=challenger,
        champion_metrics=(champion.model_card or {}).get("metrics") if champion else None,
        challenger_metrics=(challenger.model_card or {}).get("metrics") or {},
        recommendation=recommendation,
    )


def _get_owned_version(db: Session, version_id: str, current_user) -> tuple[ModelVersion, Job]:
    version = db.get(ModelVersion, version_id)
    if version is None or (current_user.id != "system" and version.owner_id != current_user.id):
        raise HTTPException(status_code=404, detail="Model version not found.")
    job = db.get(Job, version.job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Source job for this version no longer exists.")
    return version, job


@router.post("/{version_id}/promote", response_model=ModelVersionResponse)
def promote(version_id: str, body: PromoteRequest, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    version, job = _get_owned_version(db, version_id, current_user)
    try:
        return registry_service.promote(db, version, job, body.target_state)
    except registry_service.RegistryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{version_id}/rollback", response_model=ModelVersionResponse)
def rollback(version_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    version, _job = _get_owned_version(db, version_id, current_user)
    try:
        return registry_service.rollback(db, version)
    except registry_service.RegistryError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
