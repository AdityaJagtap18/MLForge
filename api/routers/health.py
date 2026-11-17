from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from api.db import get_db
from api.schemas import HealthResponse
from ml_core import catalog

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    """Reports real dependency state, not a hard-coded success (transformation
    prompt rule: health endpoints must not lie)."""
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_status = "unreachable"

    catalog_status = "ok"
    try:
        catalog.list_model_names()
    except Exception:
        catalog_status = "unreachable"

    overall = "ok" if db_status == "ok" and catalog_status == "ok" else "degraded"
    return HealthResponse(status=overall, database=db_status, model_catalog=catalog_status)
