"""Shared authorization helpers for club-scoped endpoints."""
import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser
from app.models import Club


async def assert_club_access(
    club_id: uuid.UUID, auth: AuthUser, db: AsyncSession
) -> Club:
    """Load a club and verify the caller has access to it.

    - superadmin: always allowed
    - owner: only if club.owner_id matches their sub

    Returns the loaded Club. Raises 404 if not found, 403 if forbidden.
    """
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    if auth.role == "owner" and (club.owner_id is None or str(club.owner_id) != auth.sub):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado a este clube")
    return club
