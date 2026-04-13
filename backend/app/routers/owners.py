import uuid

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, get_current_owner
from app.database import get_db
from app.schemas import OwnerLogin, OwnerPasswordChange, OwnerRegister, OwnerResponse, TokenResponse

router = APIRouter(prefix="/owner", tags=["owner"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register_owner(data: OwnerRegister, db: AsyncSession = Depends(get_db)):
    """Self-register as a club owner. Creates both the owner account and a new club."""
    from app.auth import create_access_token
    from app.models import Club, ClubOwner

    # Check email uniqueness
    existing_email = await db.execute(select(ClubOwner).where(ClubOwner.email == data.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este email já está cadastrado")

    # Check slug uniqueness
    existing_slug = await db.execute(select(Club).where(Club.slug == data.club_slug))
    if existing_slug.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Este slug já está em uso")

    # Create owner
    owner = ClubOwner(
        id=uuid.uuid4(),
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode(),
    )
    db.add(owner)

    # Create club linked to owner
    club = Club(
        id=uuid.uuid4(),
        owner_id=owner.id,
        name=data.club_name,
        slug=data.club_slug,
    )
    db.add(club)

    await db.flush()

    token = create_access_token(str(owner.id), role="owner")
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def owner_login(data: OwnerLogin, db: AsyncSession = Depends(get_db)):
    """Authenticate a club owner with email + password."""
    from app.auth import create_access_token
    from app.models import ClubOwner

    result = await db.execute(select(ClubOwner).where(ClubOwner.email == data.email))
    owner = result.scalar_one_or_none()
    if not owner or not bcrypt.checkpw(data.password.encode(), owner.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas")

    token = create_access_token(str(owner.id), role="owner")
    return TokenResponse(access_token=token)


@router.get("/me", response_model=OwnerResponse)
async def get_my_profile(
    db: AsyncSession = Depends(get_db),
    auth: AuthUser = Depends(get_current_owner),
):
    """Get the authenticated owner's profile."""
    from app.models import ClubOwner

    owner = await db.get(ClubOwner, uuid.UUID(auth.sub))
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proprietário não encontrado")
    return OwnerResponse.model_validate(owner)


@router.put("/me/password")
async def change_password(
    data: OwnerPasswordChange,
    db: AsyncSession = Depends(get_db),
    auth: AuthUser = Depends(get_current_owner),
):
    """Change the owner's password."""
    from app.models import ClubOwner

    owner = await db.get(ClubOwner, uuid.UUID(auth.sub))
    if not owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Proprietário não encontrado")

    if not bcrypt.checkpw(data.current_password.encode(), owner.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Senha atual incorreta")

    owner.password_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
    await db.flush()
    return {"status": "ok"}
