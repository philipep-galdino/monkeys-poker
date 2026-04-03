"""initial schema with all 5 tables

Revision ID: 001
Revises:
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # players
    op.create_table(
        "players",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_players_phone", "players", ["phone"])

    # sessions
    op.create_table(
        "sessions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("blinds_info", sa.String(100), nullable=False),
        sa.Column("buy_in_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("rebuy_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("allow_rebuys", sa.Boolean, default=True),
        sa.Column("status", sa.String(20), default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "uq_sessions_open",
        "sessions",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )

    # session_players
    op.create_table(
        "session_players",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "player_id",
            UUID(as_uuid=True),
            sa.ForeignKey("players.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("token", UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(20), default="waiting_payment"),
        sa.Column("total_chips_in", sa.Integer, default=0),
        sa.Column("total_chips_out", sa.Integer, default=0),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("session_id", "player_id", name="uq_session_player"),
    )
    op.create_index("ix_session_players_token", "session_players", ["token"], unique=True)

    # transactions
    op.create_table(
        "transactions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "session_player_id",
            UUID(as_uuid=True),
            sa.ForeignKey("session_players.id"),
            nullable=False,
        ),
        sa.Column("type", sa.String(20), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("chip_count", sa.Integer, nullable=False),
        sa.Column("payment_method", sa.String(20), nullable=True),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )

    # payments_pix
    op.create_table(
        "payments_pix",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "transaction_id",
            UUID(as_uuid=True),
            sa.ForeignKey("transactions.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("mp_payment_id", sa.String(50), nullable=False),
        sa.Column("qr_code_base64", sa.Text, nullable=False),
        sa.Column("qr_code", sa.Text, nullable=False),
        sa.Column("status", sa.String(20), default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_payments_pix_mp_payment_id", "payments_pix", ["mp_payment_id"])


def downgrade() -> None:
    op.drop_table("payments_pix")
    op.drop_table("transactions")
    op.drop_table("session_players")
    op.drop_table("sessions")
    op.drop_table("players")
