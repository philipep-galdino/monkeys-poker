"""add payment_mode, pix_key, mp credentials to clubs

Revision ID: 008
Revises: 007
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clubs",
        sa.Column("payment_mode", sa.String(20), server_default="static_pix", nullable=False),
    )
    op.add_column(
        "clubs",
        sa.Column("pix_key", sa.String(100), nullable=True),
    )
    op.add_column(
        "clubs",
        sa.Column("mp_access_token", sa.String(500), nullable=True),
    )
    op.add_column(
        "clubs",
        sa.Column("mp_webhook_secret", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clubs", "mp_webhook_secret")
    op.drop_column("clubs", "mp_access_token")
    op.drop_column("clubs", "pix_key")
    op.drop_column("clubs", "payment_mode")
