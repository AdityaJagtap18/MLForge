from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from api.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """Phase 2 FR-AUTH-02/03: user accounts + ownership scoping."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class AccessToken(Base):
    """Opaque bearer token issued on login. Deliberately not a self-encoding
    JWT: revocation (logout) just deletes the row, no blocklist needed."""

    __tablename__ = "access_tokens"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)


class Job(Base):
    """One training run, AutoML search, or prediction job.

    This is the metadata store PRD FR-LOG requires: previously, every job
    left only a UUID-named CSV/pickle pair under MLForge_files/ with no
    queryable record (see docs/architecture/current-state.md).
    """

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    job_type: Mapped[str] = mapped_column(String(32))  # train | find_best | predict
    status: Mapped[str] = mapped_column(String(16), default="pending")  # pending|running|succeeded|failed
    dataset_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    dataset_fingerprint: Mapped[str] = mapped_column(String(64), nullable=True)  # sha256 of uploaded bytes
    model_name: Mapped[str] = mapped_column(String(128), nullable=True)
    input_cols: Mapped[list] = mapped_column(JSON, nullable=True)
    target_col: Mapped[str] = mapped_column(String(128), nullable=True)
    task_type: Mapped[str] = mapped_column(String(16), nullable=True)
    model_params: Mapped[dict] = mapped_column(JSON, nullable=True)
    metrics: Mapped[dict] = mapped_column(JSON, nullable=True)
    results: Mapped[list] = mapped_column(JSON, nullable=True)  # find_best per-candidate results
    pickle_path: Mapped[str] = mapped_column(String(512), nullable=True)
    mlflow_run_id: Mapped[str] = mapped_column(String(64), nullable=True)
    error_message: Mapped[str] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class ModelVersion(Base):
    """Registry entry for a trained job's artifact.

    Per docs/adr/0004: THIS table is authoritative for lifecycle state,
    promotion approvals and rollback -- MLflow (via Job.mlflow_run_id) is
    authoritative for the run's own tracked params/metrics/lineage, not for
    "what's in production."
    """

    __tablename__ = "model_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    job_id: Mapped[str] = mapped_column(String(36), ForeignKey("jobs.id"), index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    model_name: Mapped[str] = mapped_column(String(128))
    version: Mapped[int] = mapped_column(Integer)
    lifecycle_state: Mapped[str] = mapped_column(String(16), default="development")
    # development | staging | production | archived
    model_card: Mapped[dict] = mapped_column(JSON, nullable=True)
    promoted_from: Mapped[str] = mapped_column(String(36), nullable=True)  # previous production version id, for rollback
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    promoted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
