import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_admin
from app.config import settings
from app.database import get_db
from app.models import Player, Session, SessionPlayer
from app.schemas import (
    PlayerJoinRequest,
    PlayerJoinResponse,
    PlayerBrief,
    PlayerSessionResponse,
    SessionCreate,
    SessionDetailResponse,
    SessionListResponse,
    SessionPlayerResponse,
    SessionResponse,
    TransactionResponse,
)
from app.services.websocket_manager import manager

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Create a new poker session. Only one open session is allowed at a time."""
    existing = await db.execute(select(Session).where(Session.status == "open"))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma sessão aberta. Encerre a sessão atual antes de criar uma nova.",
        )

    session = Session(**data.model_dump())
    db.add(session)
    await db.flush()
    return _session_to_response(session)


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """List all sessions with pagination, ordered by newest first."""
    total_q = await db.execute(select(func.count(Session.id)))
    total = total_q.scalar_one()

    result = await db.execute(
        select(Session)
        .order_by(Session.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    sessions = result.scalars().all()

    items = []
    for s in sessions:
        count_q = await db.execute(
            select(func.count(SessionPlayer.id)).where(SessionPlayer.session_id == s.id)
        )
        items.append(_session_to_response(s, player_count=count_q.scalar_one()))

    return SessionListResponse(items=items, total=total)


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Get session details with the full player list and their transactions."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.session_players)
            .selectinload(SessionPlayer.player),
            selectinload(Session.session_players)
            .selectinload(SessionPlayer.transactions),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")

    return SessionDetailResponse(
        **_session_to_response(session, player_count=len(session.session_players)).model_dump(),
        session_players=[
            SessionPlayerResponse(
                id=sp.id,
                player=PlayerBrief.model_validate(sp.player),
                token=sp.token,
                status=sp.status,
                total_chips_in=sp.total_chips_in,
                total_chips_out=sp.total_chips_out,
                joined_at=sp.joined_at,
                transactions=[TransactionResponse.model_validate(t) for t in sp.transactions],
            )
            for sp in session.session_players
        ],
    )


@router.post("/{session_id}/join", response_model=PlayerJoinResponse)
async def join_session(
    session_id: uuid.UUID,
    data: PlayerJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a player in a session. Reuses existing player records by phone."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")
    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão encerrada")

    phone = data.phone  # Already normalized by validator

    # Find or create the player
    result = await db.execute(select(Player).where(Player.phone == phone))
    player = result.scalar_one_or_none()
    is_returning = False

    if player:
        if player.name != data.name:
            player.name = data.name
    else:
        player = Player(name=data.name, phone=phone)
        db.add(player)
        await db.flush()

    # Check for existing session_player
    result = await db.execute(
        select(SessionPlayer).where(
            SessionPlayer.session_id == session_id,
            SessionPlayer.player_id == player.id,
        )
    )
    sp = result.scalar_one_or_none()

    if sp:
        is_returning = True
    else:
        sp = SessionPlayer(session_id=session_id, player_id=player.id)
        db.add(sp)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            result = await db.execute(
                select(SessionPlayer).where(
                    SessionPlayer.session_id == session_id,
                    SessionPlayer.player_id == player.id,
                )
            )
            sp = result.scalar_one()
            is_returning = True

        if not is_returning:
            await manager.broadcast(session_id, "player_joined", {
                "player_id": str(player.id),
                "player_name": player.name,
                "status": sp.status,
            })

    return PlayerJoinResponse(
        token=sp.token,
        player_url=f"/session/{session_id}/player/{sp.token}",
        player=PlayerBrief(id=player.id, name=player.name, phone=player.phone),
        is_returning=is_returning,
    )


@router.get("/{session_id}/player/{token}", response_model=PlayerSessionResponse)
async def get_player_session(
    session_id: uuid.UUID,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get the player's session state, including transaction history."""
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id, SessionPlayer.token == token)
        .options(
            selectinload(SessionPlayer.player),
            selectinload(SessionPlayer.session),
            selectinload(SessionPlayer.transactions),
        )
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link inválido")

    return PlayerSessionResponse(
        id=sp.id,
        session_id=sp.session_id,
        session_name=sp.session.name,
        player_name=sp.player.name,
        status=sp.status,
        total_chips_in=sp.total_chips_in,
        total_chips_out=sp.total_chips_out,
        transactions=[TransactionResponse.model_validate(t) for t in sp.transactions],
    )


def _session_to_response(session: Session, player_count: int = 0) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        name=session.name,
        blinds_info=session.blinds_info,
        buy_in_amount=float(session.buy_in_amount),
        rebuy_amount=float(session.rebuy_amount),
        allow_rebuys=session.allow_rebuys,
        status=session.status,
        created_at=session.created_at,
        closed_at=session.closed_at,
        player_count=player_count,
    )
