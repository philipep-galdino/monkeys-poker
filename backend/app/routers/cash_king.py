import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import AuthUser, get_current_admin
from app.database import get_db
from app.models import CashKingScore, Player, Session, SessionPlayer
from app.schemas import (
    CashKingEditRequest,
    CashKingLeaderboardEntry,
    CashKingLeaderboardResponse,
    CashKingManualCreate,
    CashKingScoreResponse,
    PlayerBrief,
)

router = APIRouter(tags=["cash-king"])


def _score_to_response(s: CashKingScore) -> CashKingScoreResponse:
    session_name = None
    session_date = None
    if s.session_player and s.session_player.session:
        session_name = s.session_player.session.name
        session_date = s.session_player.session.created_at

    return CashKingScoreResponse(
        id=s.id,
        player=PlayerBrief(id=s.player.id, name=s.player.name, phone=s.player.phone),
        session_name=session_name,
        session_date=session_date,
        description=s.description,
        attendance_pts=float(s.attendance_pts),
        hours_pts=float(s.hours_pts),
        croupier_pts=float(s.croupier_pts),
        profit_pts=float(s.profit_pts),
        manual_adj=float(s.manual_adj),
        total_pts=float(s.total_pts),
    )


@router.get(
    "/admin/clubs/{club_id}/players",
    response_model=list[PlayerBrief],
)
async def list_club_players(
    club_id: uuid.UUID,
    q: str | None = None,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """List all players in a club, optionally filtered by name."""
    query = select(Player).where(Player.club_id == club_id).order_by(Player.name)
    if q:
        query = query.where(Player.name.ilike(f"%{q}%"))
    result = await db.execute(query.limit(50))
    players = result.scalars().all()
    return [PlayerBrief(id=p.id, name=p.name, phone=p.phone) for p in players]


@router.get(
    "/clubs/{club_id}/cash-king/leaderboard",
    response_model=CashKingLeaderboardResponse,
)
async def get_leaderboard(
    club_id: uuid.UUID,
    year_month: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Monthly Cash King leaderboard. Defaults to current month."""
    if not year_month:
        year_month = datetime.now(timezone.utc).strftime("%Y-%m")

    result = await db.execute(
        select(
            CashKingScore.player_id,
            func.sum(CashKingScore.total_pts).label("total_pts"),
            func.count(CashKingScore.id).label("session_count"),
        )
        .where(CashKingScore.club_id == club_id, CashKingScore.year_month == year_month)
        .group_by(CashKingScore.player_id)
        .order_by(func.sum(CashKingScore.total_pts).desc())
    )
    rows = result.all()

    if not rows:
        return CashKingLeaderboardResponse(year_month=year_month, entries=[])

    player_ids = [r.player_id for r in rows]
    players_result = await db.execute(
        select(Player).where(Player.id.in_(player_ids))
    )
    players_map = {p.id: p for p in players_result.scalars().all()}

    entries = []
    for r in rows:
        player = players_map.get(r.player_id)
        if not player:
            continue
        entries.append(CashKingLeaderboardEntry(
            player=PlayerBrief(id=player.id, name=player.name, phone=player.phone),
            total_pts=float(r.total_pts),
            session_count=r.session_count,
        ))

    return CashKingLeaderboardResponse(year_month=year_month, entries=entries)


@router.get(
    "/clubs/{club_id}/cash-king/players/{player_id}",
    response_model=list[CashKingScoreResponse],
)
async def get_player_scores(
    club_id: uuid.UUID,
    player_id: uuid.UUID,
    year_month: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Per-session breakdown for a player in a given month."""
    if not year_month:
        year_month = datetime.now(timezone.utc).strftime("%Y-%m")

    result = await db.execute(
        select(CashKingScore)
        .where(
            CashKingScore.club_id == club_id,
            CashKingScore.player_id == player_id,
            CashKingScore.year_month == year_month,
        )
        .options(
            selectinload(CashKingScore.player),
            selectinload(CashKingScore.session_player).selectinload(SessionPlayer.session),
        )
        .order_by(CashKingScore.created_at.desc())
    )
    scores = result.scalars().all()

    return [_score_to_response(s) for s in scores]


@router.post(
    "/admin/clubs/{club_id}/cash-king/scores",
    response_model=CashKingScoreResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_manual_score(
    club_id: uuid.UUID,
    data: CashKingManualCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Admin: manually add a player to the Cash King ranking."""
    player = await db.get(Player, data.player_id)
    if not player or player.club_id != club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Jogador não encontrado neste clube")

    year_month = data.year_month or datetime.now(timezone.utc).strftime("%Y-%m")

    total = round(
        data.attendance_pts + data.hours_pts +
        data.croupier_pts + data.profit_pts +
        data.manual_adj, 2
    )

    score = CashKingScore(
        club_id=club_id,
        player_id=data.player_id,
        session_player_id=None,
        year_month=year_month,
        description=data.description,
        attendance_pts=data.attendance_pts,
        hours_pts=data.hours_pts,
        croupier_pts=data.croupier_pts,
        profit_pts=data.profit_pts,
        manual_adj=data.manual_adj,
        total_pts=total,
    )
    db.add(score)
    await db.flush()
    await db.refresh(score, attribute_names=["player"])

    return CashKingScoreResponse(
        id=score.id,
        player=PlayerBrief(id=player.id, name=player.name, phone=player.phone),
        session_name=None,
        session_date=None,
        description=score.description,
        attendance_pts=float(score.attendance_pts),
        hours_pts=float(score.hours_pts),
        croupier_pts=float(score.croupier_pts),
        profit_pts=float(score.profit_pts),
        manual_adj=float(score.manual_adj),
        total_pts=float(score.total_pts),
    )


@router.put(
    "/admin/clubs/{club_id}/cash-king/scores/{score_id}",
    response_model=CashKingScoreResponse,
)
async def edit_score(
    club_id: uuid.UUID,
    score_id: uuid.UUID,
    data: CashKingEditRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Admin: edit individual point components of a Cash King score."""
    result = await db.execute(
        select(CashKingScore)
        .where(CashKingScore.id == score_id, CashKingScore.club_id == club_id)
        .options(
            selectinload(CashKingScore.player),
            selectinload(CashKingScore.session_player).selectinload(SessionPlayer.session),
        )
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score não encontrado")

    if data.attendance_pts is not None:
        score.attendance_pts = data.attendance_pts
    if data.hours_pts is not None:
        score.hours_pts = data.hours_pts
    if data.croupier_pts is not None:
        score.croupier_pts = data.croupier_pts
    if data.profit_pts is not None:
        score.profit_pts = data.profit_pts
    if data.manual_adj is not None:
        score.manual_adj = data.manual_adj

    score.total_pts = round(
        float(score.attendance_pts) + float(score.hours_pts) +
        float(score.croupier_pts) + float(score.profit_pts) +
        float(score.manual_adj), 2
    )
    score.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return _score_to_response(score)


@router.delete(
    "/admin/clubs/{club_id}/cash-king/scores/{score_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_score(
    club_id: uuid.UUID,
    score_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Admin: delete a Cash King score entry."""
    result = await db.execute(
        select(CashKingScore)
        .where(CashKingScore.id == score_id, CashKingScore.club_id == club_id)
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Score não encontrado")

    await db.delete(score)
    await db.flush()
