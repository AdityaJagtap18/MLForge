"""phase 3: deployments, request_logs, monitoring_snapshots

Revision ID: 0004
Revises: 0003
Create Date: 2026-11-18

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "deployments",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("model_version_id", sa.String(length=36), sa.ForeignKey("model_versions.id", name="fk_deployments_model_version_id"), nullable=False),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", name="fk_deployments_owner_id"), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("replaced_by", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_deployments_model_version_id", "deployments", ["model_version_id"])
    op.create_index("ix_deployments_owner_id", "deployments", ["owner_id"])

    op.create_table(
        "request_logs",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("deployment_id", sa.String(length=36), sa.ForeignKey("deployments.id", name="fk_request_logs_deployment_id"), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_request_logs_deployment_id", "request_logs", ["deployment_id"])
    op.create_index("ix_request_logs_created_at", "request_logs", ["created_at"])

    op.create_table(
        "monitoring_snapshots",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("deployment_id", sa.String(length=36), sa.ForeignKey("deployments.id", name="fk_monitoring_snapshots_deployment_id"), nullable=False),
        sa.Column("drift_type", sa.String(length=32), nullable=False),
        sa.Column("n_rows", sa.Integer(), nullable=False),
        sa.Column("drift_detected", sa.Boolean(), nullable=True),
        sa.Column("drift_share", sa.Float(), nullable=True),
        sa.Column("report", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="ok"),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_monitoring_snapshots_deployment_id", "monitoring_snapshots", ["deployment_id"])
    op.create_index("ix_monitoring_snapshots_created_at", "monitoring_snapshots", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_monitoring_snapshots_created_at", table_name="monitoring_snapshots")
    op.drop_index("ix_monitoring_snapshots_deployment_id", table_name="monitoring_snapshots")
    op.drop_table("monitoring_snapshots")

    op.drop_index("ix_request_logs_created_at", table_name="request_logs")
    op.drop_index("ix_request_logs_deployment_id", table_name="request_logs")
    op.drop_table("request_logs")

    op.drop_index("ix_deployments_owner_id", table_name="deployments")
    op.drop_index("ix_deployments_model_version_id", table_name="deployments")
    op.drop_table("deployments")
