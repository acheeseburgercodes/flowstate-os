"""Durable Switch connection cursors and deduplicated addressed inbox."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "switch_connections",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("connection_id", sa.String(36), nullable=False),
        sa.Column("cursor", sa.Integer()),
        sa.Column("generation", sa.Integer()),
        sa.Column("gap", sa.Boolean(), nullable=False),
    )
    op.create_table(
        "switch_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("connection_key", sa.String(64), nullable=False),
        sa.Column("room_id", sa.String(256), nullable=False),
        sa.Column("message_id", sa.String(256), nullable=False),
        sa.Column("sender", sa.String(512), nullable=False),
        sa.Column("body", sa.String(65536), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("history_gap", sa.Boolean(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("connection_key", "room_id", "message_id"),
    )
    op.create_index(
        "ix_switch_messages_connection_key", "switch_messages", ["connection_key"]
    )


def downgrade():
    op.drop_table("switch_messages")
    op.drop_table("switch_connections")
