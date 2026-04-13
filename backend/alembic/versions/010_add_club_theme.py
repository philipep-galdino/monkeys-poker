"""add theme columns to clubs

Revision ID: 010
Revises: 009
Create Date: 2026-04-09
"""

from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("logo_url", sa.String(500), nullable=True))
    op.add_column("clubs", sa.Column("primary_color", sa.String(7), server_default="#d4a937", nullable=False))
    op.add_column("clubs", sa.Column("accent_color", sa.String(7), server_default="#1a5c38", nullable=False))
    op.add_column("clubs", sa.Column("bg_color", sa.String(7), server_default="#0f1419", nullable=False))
    op.add_column("clubs", sa.Column("text_color", sa.String(7), server_default="#e5e7eb", nullable=False))
    op.add_column("clubs", sa.Column("bg_image_url", sa.String(500), nullable=True))
    op.add_column("clubs", sa.Column("font_family", sa.String(100), server_default="Inter", nullable=False))
    op.add_column("clubs", sa.Column("tv_layout", sa.String(20), server_default="classic", nullable=False))


def downgrade() -> None:
    op.drop_column("clubs", "tv_layout")
    op.drop_column("clubs", "font_family")
    op.drop_column("clubs", "bg_image_url")
    op.drop_column("clubs", "text_color")
    op.drop_column("clubs", "bg_color")
    op.drop_column("clubs", "accent_color")
    op.drop_column("clubs", "primary_color")
    op.drop_column("clubs", "logo_url")
