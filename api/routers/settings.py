from __future__ import annotations

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from api import settings_service
from api.auth import require_auth_if_configured
from api.db import get_db
from api.schemas import DependencyHealthDetail, SettingsResponse, UserProfileInfo

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_auth_if_configured)])


@router.get("", response_model=SettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    authorization: str | None = Header(default=None),
):
    """Authoritative system settings, capabilities, dependency health, and session state (Task 5B.7)."""
    return settings_service.get_full_settings(db, current_user, authorization)


@router.get("/profile", response_model=UserProfileInfo)
def get_profile(
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    authorization: str | None = Header(default=None),
):
    """Authenticated user profile and session expiration metadata."""
    return settings_service.get_user_profile(db, current_user, authorization)


@router.get("/health", response_model=list[DependencyHealthDetail])
def get_dependency_health(db: Session = Depends(get_db)):
    """Granular live health diagnostics for FastAPI, DB, Catalog, MLflow, and Evidently."""
    return settings_service.check_dependencies_health(db)
