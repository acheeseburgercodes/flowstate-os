"""Portable plans with revision-bound decisions and one-shot publication."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "proposals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("idempotency_key", sa.String(36), nullable=False, unique=True),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("state", sa.String(32), nullable=False),
        sa.Column("manifest", sa.JSON(), nullable=False),
        sa.Column("source_message_ids", sa.JSON(), nullable=False),
        sa.Column("publication", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("proposals")
