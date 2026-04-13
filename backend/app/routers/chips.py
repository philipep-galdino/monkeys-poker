import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import AuthUser, get_current_admin
from app.database import get_db
from app.models import ChipDenomination, Club
from app.schemas import (
    ChipBreakdownResponse,
    ChipBreakdownItem,
    ChipDenominationItem,
    ChipDenominationResponse,
)
from app.services.chip_service import calculate_breakdown

router = APIRouter(prefix="/clubs/{club_id}", tags=["chips"])


@router.get("/chip-denominations", response_model=list[ChipDenominationResponse])
async def list_chip_denominations(
    club_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """List all chip denominations for a club."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")

    result = await db.execute(
        select(ChipDenomination)
        .where(ChipDenomination.club_id == club_id)
        .order_by(ChipDenomination.sort_order, ChipDenomination.value)
    )
    return [ChipDenominationResponse.model_validate(d) for d in result.scalars().all()]


@router.put("/chip-denominations", response_model=list[ChipDenominationResponse])
async def set_chip_denominations(
    club_id: uuid.UUID,
    items: list[ChipDenominationItem],
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Bulk set chip denominations for a club. Replaces all existing denominations."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")

    # Delete existing
    result = await db.execute(
        select(ChipDenomination).where(ChipDenomination.club_id == club_id)
    )
    for existing in result.scalars().all():
        await db.delete(existing)
    await db.flush()

    # Create new
    created = []
    for item in items:
        denom = ChipDenomination(
            club_id=club_id,
            **item.model_dump(),
        )
        db.add(denom)
        await db.flush()
        created.append(ChipDenominationResponse.model_validate(denom))

    return created


@router.get("/chip-breakdown", response_model=ChipBreakdownResponse)
async def get_chip_breakdown(
    club_id: uuid.UUID,
    amount: float = Query(gt=0),
    exclude: str | None = Query(None, description="Comma-separated values to exclude"),
    blinds_info: str = Query("0/0"),
    table_limit: int = Query(1, ge=1),
    db: AsyncSession = Depends(get_db),
):
    """Calculate chip breakdown for a given amount based on club's chip config."""
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")

    result = await db.execute(
        select(ChipDenomination).where(ChipDenomination.club_id == club_id)
    )
    denominations = result.scalars().all()

    if not denominations:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhuma ficha configurada para este clube.",
        )

    excluded_values = [float(v.strip()) for v in exclude.split(",") if v.strip()] if exclude else []

    breakdown = calculate_breakdown(denominations, amount, excluded_values, blinds_info, table_limit)

    return ChipBreakdownResponse(
        items=[ChipBreakdownItem(**item) for item in breakdown["items"]],
        total_value=breakdown["total_value"],
        total_chips_count=breakdown.get("total_chips_count", 0),
        remainder=breakdown["remainder"],
    )
