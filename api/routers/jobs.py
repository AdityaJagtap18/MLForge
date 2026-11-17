from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from api import services
from api.auth import require_auth_if_configured
from api.db import get_db
from api.db_models import Job
from api.schemas import JobDetail, JobSummary

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(
    db: Session = Depends(get_db),
    current_user=Depends(require_auth_if_configured),
    limit: int = 50,
    job_type: str | None = None,
):
    """Closes the FR-LOG gap: frontend/logs.html previously had no backend
    and no persisted record of past training runs. Scoped to the caller's
    own jobs (FR-AUTH-03) -- SystemPrincipal (legacy API key) sees all."""
    stmt = select(Job).order_by(Job.created_at.desc()).limit(min(limit, 200))
    if job_type:
        stmt = stmt.where(Job.job_type == job_type)
    if current_user.id != "system":
        stmt = stmt.where(Job.owner_id == current_user.id)
    return db.execute(stmt).scalars().all()


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db), current_user=Depends(require_auth_if_configured)):
    job = db.get(Job, job_id)
    if job is None or not services.owns(job, current_user):
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
