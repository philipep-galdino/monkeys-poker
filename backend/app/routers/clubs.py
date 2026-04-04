import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_admin
from app.database import get_db
from app.models import Club
from app.schemas import ClubCreate, ClubListResponse, ClubResponse, ClubUpdate

router = APIRouter(prefix="/clubs", tags=["clubs"])


@router.post("", response_model=ClubResponse, status_code=status.HTTP_201_CREATED)
async def create_club(
    data: ClubCreate,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Create a new club."""
    existing = await db.execute(select(Club).where(Club.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Um clube com esse slug já existe.",
        )
    club = Club(**data.model_dump())
    db.add(club)
    await db.flush()
    return ClubResponse.model_validate(club)


@router.get("", response_model=ClubListResponse)
async def list_clubs(
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """List all clubs."""
    total_q = await db.execute(select(func.count(Club.id)))
    total = total_q.scalar_one()

    result = await db.execute(select(Club).order_by(Club.created_at.desc()))
    clubs = result.scalars().all()

    return ClubListResponse(
        items=[ClubResponse.model_validate(c) for c in clubs],
        total=total,
    )


@router.get("/{club_id}", response_model=ClubResponse)
async def get_club(
    club_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Get club details."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    return ClubResponse.model_validate(club)


@router.put("/{club_id}", response_model=ClubResponse)
async def update_club(
    club_id: uuid.UUID,
    data: ClubUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Update club settings (name, description, rake defaults)."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(club, field, value)

    await db.flush()
    return ClubResponse.model_validate(club)
