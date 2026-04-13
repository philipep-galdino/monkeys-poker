"""add club_owners table and owner_id FK on clubs

Revision ID: 009
Revises: 008
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "club_owners",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.String(200), unique=True, nullable=False),
        sa.Column("phone", sa.String(20), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("password_hash", sa.String(200), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.add_column(
        "clubs",
        sa.Column("owner_id", UUID(as_uuid=True), sa.ForeignKey("club_owners.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("clubs", "owner_id")
    op.drop_table("club_owners")
