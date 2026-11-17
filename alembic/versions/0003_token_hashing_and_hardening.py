"""hardening: hash access tokens, add expiry/revocation, job tracking_status,
model_versions uniqueness

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-18

BREAKING CHANGE: access_tokens is dropped and recreated. The 0002 schema
stored the raw bearer token itself as the primary key -- there is no way to
derive a SHA-256 hash from a token we never persisted a reversible form of
without the original plaintext, and keeping the old plaintext-keyed table
around would defeat the point of this migration. Every existing session is
invalidated; every user must log in again after this migration runs. This
is treated as an acceptable, security-positive outcome of fixing a real
token-storage weakness, not an oversight -- see docs/implementation-status.md.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("access_tokens")
    op.create_table(
        "access_tokens",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_access_tokens_token_hash", "access_tokens", ["token_hash"], unique=True)
    op.create_index("ix_access_tokens_user_id", "access_tokens", ["user_id"])

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.add_column(sa.Column("tracking_status", sa.String(length=16), nullable=True))

    with op.batch_alter_table("model_versions") as batch_op:
        batch_op.create_unique_constraint(
            "uq_model_versions_owner_model_version", ["owner_id", "model_name", "version"]
        )


def downgrade() -> None:
    with op.batch_alter_table("model_versions") as batch_op:
        batch_op.drop_constraint("uq_model_versions_owner_model_version", type_="unique")

    with op.batch_alter_table("jobs") as batch_op:
        batch_op.drop_column("tracking_status")

    op.drop_index("ix_access_tokens_user_id", table_name="access_tokens")
    op.drop_index("ix_access_tokens_token_hash", table_name="access_tokens")
    op.drop_table("access_tokens")
    op.create_table(
        "access_tokens",
        sa.Column("token", sa.String(length=64), primary_key=True),
        sa.Column("user_id", sa.String(length=36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_access_tokens_user_id", "access_tokens", ["user_id"])
