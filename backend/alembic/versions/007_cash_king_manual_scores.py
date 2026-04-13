"""allow manual cash king scores without a session

Revision ID: 007
Revises: 006
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "cash_king_scores",
        "session_player_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=True,
    )
    op.add_column(
        "cash_king_scores",
        sa.Column("description", sa.String(200), nullable=True),
    )
    # Drop the old unique constraint that doesn't allow NULLs properly
    op.drop_constraint("uq_cashking_session_player", "cash_king_scores", type_="unique")
    # Re-create as a unique index with a WHERE clause (only for non-null values)
    op.create_index(
        "uq_cashking_session_player",
        "cash_king_scores",
        ["session_player_id"],
        unique=True,
        postgresql_where=sa.text("session_player_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_cashking_session_player", "cash_king_scores")
    op.create_unique_constraint(
        "uq_cashking_session_player", "cash_king_scores", ["session_player_id"]
    )
    op.drop_column("cash_king_scores", "description")
    op.alter_column(
        "cash_king_scores",
        "session_player_id",
        existing_type=sa.dialects.postgresql.UUID(),
        nullable=False,
    )
