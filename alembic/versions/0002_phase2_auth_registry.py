"""phase 2: users, access_tokens, model_versions, job ownership/lineage columns

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-17

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "access_tokens",
        sa.Column("token", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_access_tokens_user_id", "access_tokens", ["user_id"])

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True))
        batch_op.add_column(sa.Column("dataset_fingerprint", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("mlflow_run_id", sa.String(length=64), nullable=True))
    op.create_index("ix_jobs_owner_id", "jobs", ["owner_id"])

    op.create_table(
        "model_versions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("job_id", sa.String(length=36), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("owner_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("model_name", sa.String(length=128), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("lifecycle_state", sa.String(length=16), nullable=False, server_default="development"),
        sa.Column("model_card", sa.JSON(), nullable=True),
        sa.Column("promoted_from", sa.String(length=36), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("promoted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_model_versions_job_id", "model_versions", ["job_id"])
    op.create_index("ix_model_versions_owner_id", "model_versions", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_model_versions_owner_id", table_name="model_versions")
    op.drop_index("ix_model_versions_job_id", table_name="model_versions")
    op.drop_table("model_versions")

    op.drop_index("ix_jobs_owner_id", table_name="jobs")
    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_column("mlflow_run_id")
        batch_op.drop_column("dataset_fingerprint")
        batch_op.drop_column("owner_id")

    op.drop_index("ix_access_tokens_user_id", table_name="access_tokens")
    op.drop_table("access_tokens")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
