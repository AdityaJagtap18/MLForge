from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint
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
    """Opaque bearer token issued on login/register. Only the SHA-256 hash of
    the token is stored (`token_hash`) -- the raw token is returned to the
    caller exactly once and never persisted, so a database read (backup,
    leak, insider) cannot be used to authenticate as anyone. Deliberately
    not a self-encoding JWT: revocation just sets `revoked_at`, no blocklist
    needed. `expires_at` enforces a hard lifetime (default 30 days, see
    api/auth.py) in addition to explicit revocation (logout)."""

    __tablename__ = "access_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


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
    tracking_status: Mapped[str] = mapped_column(String(16), nullable=True)  # ok | unavailable | error
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
    __table_args__ = (
        # Enforced at the DB level in addition to registry_service.py's
        # application-level counting, so a race between two concurrent
        # registrations can't silently produce a duplicate version number
        # for the same owner+model_name (SQLite and PostgreSQL both treat
        # multiple NULL owner_ids as distinct for uniqueness purposes, so
        # this behaves the same on both -- see docs/implementation-plan.md
        # Phase 7 notes).
        UniqueConstraint("owner_id", "model_name", "version", name="uq_model_versions_owner_model_version"),
    )

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


class Deployment(Base):
    """Phase 3: binds one ModelVersion to a live serving slot.

    At most one Deployment is "active" per (owner_id, model_name) at a
    time -- deploying a new version marks the previous one "replaced" and
    records `replaced` -> this one's id so rollback can reverse it, the
    same pattern ModelVersion.promoted_from uses for registry rollback
    (docs/adr/0005: FastAPI serves models directly, no separate platform).
    """

    __tablename__ = "deployments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    model_version_id: Mapped[str] = mapped_column(String(36), ForeignKey("model_versions.id"), index=True)
    owner_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    model_name: Mapped[str] = mapped_column(String(128))
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | replaced | stopped
    replaced_by: Mapped[str] = mapped_column(String(36), nullable=True)  # id of the Deployment that replaced this one
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    stopped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)


class RequestLog(Base):
    """One real-time prediction call against a Deployment -- the basis for
    request count / latency / error rate (transformation prompt "Capture
    request count, latency, errors and model version")."""

    __tablename__ = "request_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    deployment_id: Mapped[str] = mapped_column(String(36), ForeignKey("deployments.id"), index=True)
    success: Mapped[bool] = mapped_column(Boolean)
    latency_ms: Mapped[float] = mapped_column(Float)
    error_message: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)


class MonitoringSnapshot(Base):
    """One drift/quality evaluation window against a Deployment.

    Per the transformation prompt: data drift, prediction drift and
    labeled-performance drift are distinct concepts and must not be
    conflated -- `drift_type` records which one this snapshot measured.
    """

    __tablename__ = "monitoring_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    deployment_id: Mapped[str] = mapped_column(String(36), ForeignKey("deployments.id"), index=True)
    drift_type: Mapped[str] = mapped_column(String(32))  # data_drift | prediction_drift
    n_rows: Mapped[int] = mapped_column(Integer)
    drift_detected: Mapped[bool] = mapped_column(Boolean, nullable=True)  # None if the check itself couldn't run
    drift_share: Mapped[float] = mapped_column(Float, nullable=True)  # fraction of columns/metrics flagged as drifted
    report: Mapped[dict] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="ok")  # ok | unavailable | error (same honesty contract as Job.tracking_status)
    error_message: Mapped[str] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, index=True)
