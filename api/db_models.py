from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Job(Base):
    """One training run, AutoML search, or prediction job.

    This is the metadata store PRD FR-LOG requires: previously, every job
    left only a UUID-named CSV/pickle pair under MLForge_files/ with no
    queryable record (see docs/architecture/current-state.md).
    """

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_type: Mapped[str] = mapped_column(String(32))  # train | find_best | predict
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|succeeded|failed
    dataset_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    model_name: Mapped[str] = mapped_column(String(128), nullable=True)
    input_cols: Mapped[list] = mapped_column(JSON, nullable=True)
    target_col: Mapped[str] = mapped_column(String(128), nullable=True)
    task_type: Mapped[str] = mapped_column(String(16), nullable=True)
    model_params: Mapped[dict] = mapped_column(JSON, nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=True)
    results: Mapped[list] = mapped_column(JSON, nullable=True)  # find_best per-candidate results
    pickle_path: Mapped[str] = mapped_column(String(512), nullable=True)
    error_message: Mapped[str] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
