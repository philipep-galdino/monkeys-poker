"""add cash king ranking system

Revision ID: 006
Revises: 005
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("cash_king_enabled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "session_players",
        sa.Column("croupier_hours", sa.Numeric(5, 2), nullable=True),
    )
    op.create_table(
        "cash_king_scores",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("club_id", UUID(as_uuid=True), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("player_id", UUID(as_uuid=True), sa.ForeignKey("players.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("session_player_id", UUID(as_uuid=True), sa.ForeignKey("session_players.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year_month", sa.String(7), nullable=False),
        sa.Column("attendance_pts", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("hours_pts", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("croupier_pts", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("profit_pts", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("manual_adj", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("total_pts", sa.Numeric(8, 2), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("session_player_id", name="uq_cashking_session_player"),
    )
    op.create_index("ix_cashking_club_month", "cash_king_scores", ["club_id", "year_month"])


def downgrade() -> None:
    op.drop_index("ix_cashking_club_month", "cash_king_scores")
    op.drop_table("cash_king_scores")
    op.drop_column("session_players", "croupier_hours")
    op.drop_column("sessions", "cash_king_enabled")
