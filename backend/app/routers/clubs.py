import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import AuthUser, get_current_admin, get_current_superadmin
from app.database import get_db
from app.models import Club, ClubOwner, Session as SessionModel
from app.schemas import ClubCreate, ClubListResponse, ClubPublicResponse, ClubResponse, ClubThemeResponse, ClubUpdate

router = APIRouter(prefix="/clubs", tags=["clubs"])


@router.post("", response_model=ClubResponse, status_code=status.HTTP_201_CREATED)
async def create_club(
    data: ClubCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_superadmin),
):
    """Create a new club. Optionally creates an owner inline."""
    existing = await db.execute(select(Club).where(Club.slug == data.slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Um clube com esse slug já existe.",
        )

    owner_id = None
    if data.owner:
        # Check if email already in use
        existing_owner = await db.execute(
            select(ClubOwner).where(ClubOwner.email == data.owner.email)
        )
        if existing_owner.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Já existe um proprietário com esse e-mail.",
            )
        password_hash = bcrypt.hashpw(data.owner.password.encode(), bcrypt.gensalt()).decode()
        owner = ClubOwner(
            name=data.owner.name,
            email=data.owner.email,
            phone=data.owner.phone,
            password_hash=password_hash,
        )
        db.add(owner)
        await db.flush()
        owner_id = owner.id

    club_data = data.model_dump(exclude={"owner"})
    club = Club(**club_data, owner_id=owner_id)
    db.add(club)
    await db.flush()

    # Reload with owner relationship
    result = await db.execute(
        select(Club).where(Club.id == club.id).options(selectinload(Club.owner))
    )
    club = result.scalar_one()
    return ClubResponse.model_validate(club)


@router.get("", response_model=ClubListResponse)
async def list_clubs(
    db: AsyncSession = Depends(get_db),
    admin: AuthUser = Depends(get_current_admin),
):
    """List clubs. Owners see only their clubs; superadmins see all."""
    base_query = select(Club).options(selectinload(Club.owner))

    if admin.role == "owner":
        base_query = base_query.where(Club.owner_id == uuid.UUID(admin.sub))

    total_q = await db.execute(
        select(func.count(Club.id)).where(
            Club.owner_id == uuid.UUID(admin.sub) if admin.role == "owner" else True
        )
    )
    total = total_q.scalar_one()

    result = await db.execute(base_query.order_by(Club.created_at.desc()))
    clubs = result.scalars().all()

    return ClubListResponse(
        items=[ClubResponse.model_validate(c) for c in clubs],
        total=total,
    )


@router.get("/{club_id}", response_model=ClubResponse)
async def get_club(
    club_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin: AuthUser = Depends(get_current_admin),
):
    """Get club details."""
    result = await db.execute(
        select(Club).where(Club.id == club_id).options(selectinload(Club.owner))
    )
    club = result.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    if admin.role == "owner" and str(club.owner_id) != admin.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")
    return ClubResponse.model_validate(club)


@router.put("/{club_id}", response_model=ClubResponse)
async def update_club(
    club_id: uuid.UUID,
    data: ClubUpdate,
    db: AsyncSession = Depends(get_db),
    admin: AuthUser = Depends(get_current_admin),
):
    """Update club settings."""
    result = await db.execute(
        select(Club).where(Club.id == club_id).options(selectinload(Club.owner))
    )
    club = result.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    if admin.role == "owner" and str(club.owner_id) != admin.sub:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(club, field, value)

    await db.flush()
    return ClubResponse.model_validate(club)


@router.get("/{club_id}/theme", response_model=ClubThemeResponse)
async def get_club_theme(
    club_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: returns club theme for player and TV pages (no auth)."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    return ClubThemeResponse.model_validate(club)


@router.get("/by-slug/{slug}", response_model=ClubPublicResponse)
async def get_club_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db),
):
    """Public endpoint: returns club public info by slug, including active session ID if any."""
    result = await db.execute(select(Club).where(Club.slug == slug))
    club = result.scalar_one_or_none()
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")

    # Find active session
    active_session = await db.execute(
        select(SessionModel.id).where(
            SessionModel.club_id == club.id,
            SessionModel.status == "open",
        ).limit(1)
    )
    active_id = active_session.scalar_one_or_none()

    resp = ClubPublicResponse.model_validate(club)
    resp.active_session_id = active_id
    return resp
