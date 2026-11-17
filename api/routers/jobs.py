from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from api.db import get_db
from api.db_models import Job
from api.deps import require_api_key
from api.schemas import JobDetail, JobSummary

router = APIRouter(tags=["jobs"], dependencies=[Depends(require_api_key)])


@router.get("/jobs", response_model=list[JobSummary])
def list_jobs(db: Session = Depends(get_db), limit: int = 50, job_type: str | None = None):
    """Closes the FR-LOG gap: frontend/logs.html previously had no backend
    and no persisted record of past training runs."""
    stmt = select(Job).order_by(Job.created_at.desc()).limit(min(limit, 200))
    if job_type:
        stmt = stmt.where(Job.job_type == job_type)
    return db.execute(stmt).scalars().all()


@router.get("/jobs/{job_id}", response_model=JobDetail)
def get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return job
