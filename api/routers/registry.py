from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api import registry_service, services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Job, ModelVersion
from api.schemas import ModelVersionResponse, PromoteRequest

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
