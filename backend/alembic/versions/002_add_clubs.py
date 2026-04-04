"""add clubs, chip_denominations tables and club_id to players/sessions

Revision ID: 002
Revises: 001
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # clubs table
    op.create_table(
        "clubs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("default_rake_buyin", sa.Numeric(10, 2), server_default="0"),
        sa.Column("default_rake_rebuy", sa.Numeric(10, 2), server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # chip_denominations table
    op.create_table(
        "chip_denominations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "club_id",
            UUID(as_uuid=True),
            sa.ForeignKey("clubs.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.String(50), nullable=False),
        sa.Column("value", sa.Numeric(10, 2), nullable=False),
        sa.Column("quantity", sa.Integer, nullable=False, server_default="0"),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("active", sa.Boolean, server_default="true"),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("club_id", "value", name="uq_club_chip_value"),
    )

    # Add nullable club_id to players and sessions (will be made NOT NULL after backfill)
    op.add_column(
        "players",
        sa.Column("club_id", UUID(as_uuid=True), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=True),
    )
    op.add_column(
        "sessions",
        sa.Column("club_id", UUID(as_uuid=True), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=True),
    )

    # Add rake columns to sessions
    op.add_column("sessions", sa.Column("rake_buyin", sa.Numeric(10, 2), server_default="0"))
    op.add_column("sessions", sa.Column("rake_rebuy", sa.Numeric(10, 2), server_default="0"))

    # Add rake_amount to transactions
    op.add_column("transactions", sa.Column("rake_amount", sa.Numeric(10, 2), server_default="0"))


def downgrade() -> None:
    op.drop_column("transactions", "rake_amount")
    op.drop_column("sessions", "rake_rebuy")
    op.drop_column("sessions", "rake_buyin")
    op.drop_column("sessions", "club_id")
    op.drop_column("players", "club_id")
    op.drop_table("chip_denominations")
    op.drop_table("clubs")
