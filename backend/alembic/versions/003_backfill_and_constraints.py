"""backfill default club, set NOT NULL, update unique constraints

Revision ID: 003
Revises: 002
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create a default club for existing data
    op.execute(
        """
        INSERT INTO clubs (id, name, slug, created_at, updated_at)
        SELECT gen_random_uuid(), 'Default Club', 'default', NOW(), NOW()
        WHERE EXISTS (SELECT 1 FROM players UNION SELECT 1 FROM sessions)
           OR NOT EXISTS (SELECT 1 FROM clubs)
        ON CONFLICT (slug) DO NOTHING
        """
    )

    # Backfill club_id on existing rows
    op.execute(
        """
        UPDATE players SET club_id = (SELECT id FROM clubs WHERE slug = 'default')
        WHERE club_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE sessions SET club_id = (SELECT id FROM clubs WHERE slug = 'default')
        WHERE club_id IS NULL
        """
    )

    # Make club_id NOT NULL
    op.alter_column("players", "club_id", nullable=False)
    op.alter_column("sessions", "club_id", nullable=False)

    # Drop old unique constraint on players.phone and old partial index on sessions
    op.drop_index("ix_players_phone", table_name="players")
    op.drop_constraint("players_phone_key", "players", type_="unique")
    op.drop_index("uq_sessions_open", table_name="sessions")

    # New compound unique: (club_id, phone) on players
    op.create_unique_constraint("uq_player_club_phone", "players", ["club_id", "phone"])
    op.create_index("ix_players_club_phone", "players", ["club_id", "phone"])

    # New partial unique index: one open session per club
    op.create_index(
        "uq_sessions_club_open",
        "sessions",
        ["club_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )


def downgrade() -> None:
    op.drop_index("uq_sessions_club_open", table_name="sessions")
    op.drop_index("ix_players_club_phone", table_name="players")
    op.drop_constraint("uq_player_club_phone", "players", type_="unique")

    # Restore old constraints
    op.create_index(
        "uq_sessions_open",
        "sessions",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.create_unique_constraint("players_phone_key", "players", ["phone"])
    op.create_index("ix_players_phone", "players", ["phone"])
