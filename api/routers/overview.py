from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from api import overview_service
from api.auth import require_auth_if_configured
from api.db import get_db
from api.schemas import OverviewStatsResponse

router = APIRouter(prefix="/overview", tags=["overview"], dependencies=[Depends(require_auth_if_configured)])


@router.get("", response_model=OverviewStatsResponse)
def get_overview(db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    """Authoritative live operational metrics for the dashboard (Task 5B.6).
    Replaces static demo arrays with real database-backed aggregations."""
    owner_id = None if current_user.id == "system" else current_user.id
    return overview_service.get_overview_stats(db, owner_id)
