"""phase 4: retraining_candidates (controlled automation)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-18

"""
from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "retraining_candidates",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id", name="fk_retraining_candidates_owner_id"), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("job_id", sa.String(length=36), sa.ForeignKey("jobs.id", name="fk_retraining_candidates_job_id"), nullable=False),
        sa.Column(
            "monitoring_snapshot_id",
            sa.String(length=36),
            sa.ForeignKey("monitoring_snapshots.id", name="fk_retraining_candidates_monitoring_snapshot_id"),
            nullable=True,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column(
            "evaluated_champion_version_id",
            sa.String(length=36),
            sa.ForeignKey("model_versions.id", name="fk_retraining_candidates_evaluated_champion_version_id"),
            nullable=True,
        ),
        sa.Column("evaluation", sa.JSON(), nullable=True),
        sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("decision", sa.String(length=16), nullable=True),
        sa.Column("decision_reason", sa.String(length=500), nullable=True),
        sa.Column("decided_by", sa.String(length=36), sa.ForeignKey("users.id", name="fk_retraining_candidates_decided_by"), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "promoted_version_id",
            sa.String(length=36),
            sa.ForeignKey("model_versions.id", name="fk_retraining_candidates_promoted_version_id"),
            nullable=True,
        ),
        sa.Column("triggered_by", sa.String(length=36), sa.ForeignKey("users.id", name="fk_retraining_candidates_triggered_by"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        # Included directly in CREATE TABLE (not a later ALTER) -- SQLite
        # cannot ADD CONSTRAINT to an existing table outside batch/recreate
        # mode, so doing this as a separate op.create_unique_constraint call
        # right after create_table would fail the same way the unnamed-FK
        # issue did in migration 0002.
        sa.UniqueConstraint("monitoring_snapshot_id", name="uq_retraining_candidates_monitoring_snapshot_id"),
    )
    op.create_index("ix_retraining_candidates_owner_id", "retraining_candidates", ["owner_id"])
    op.create_index("ix_retraining_candidates_model_name", "retraining_candidates", ["model_name"])
    op.create_index("ix_retraining_candidates_job_id", "retraining_candidates", ["job_id"])
    op.create_index("ix_retraining_candidates_monitoring_snapshot_id", "retraining_candidates", ["monitoring_snapshot_id"])
    op.create_index("ix_retraining_candidates_created_at", "retraining_candidates", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_retraining_candidates_created_at", table_name="retraining_candidates")
    op.drop_index("ix_retraining_candidates_monitoring_snapshot_id", table_name="retraining_candidates")
    op.drop_index("ix_retraining_candidates_job_id", table_name="retraining_candidates")
    op.drop_index("ix_retraining_candidates_model_name", table_name="retraining_candidates")
    op.drop_index("ix_retraining_candidates_owner_id", table_name="retraining_candidates")
    op.drop_table("retraining_candidates")
