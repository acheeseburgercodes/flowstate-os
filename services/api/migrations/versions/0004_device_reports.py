"""One-shot privacy-preserving device result reports."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "device_reports",
        sa.Column("execution_id", sa.String(36), primary_key=True),
        sa.Column(
            "proposal_id", sa.String(36), sa.ForeignKey("proposals.id"), nullable=False
        ),
        sa.Column("summary", sa.JSON(), nullable=False),
        sa.Column("publication", sa.String(32), nullable=False),
    )
    op.create_index("ix_device_reports_proposal_id", "device_reports", ["proposal_id"])


def downgrade():
    op.drop_table("device_reports")
