import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_admin
from app.database import get_db
from app.models import Club, Player, Session, SessionPlayer, Transaction
from app.schemas import (
    PlayerBrief,
    PlayerHistoryItem,
    PlayerHistoryResponse,
    PlayerJoinRequest,
    PlayerJoinResponse,
    PlayerSessionResponse,
    SessionCreate,
    SessionDetailResponse,
    SessionListResponse,
    SessionPlayerResponse,
    SessionResponse,
    TransactionResponse,
)
from app.services.websocket_manager import manager
from app.services.chip_service import calculate_buyin_kit, calculate_rebuy_kit

router = APIRouter(prefix="/clubs/{club_id}/sessions", tags=["sessions"])


async def _get_club(club_id: uuid.UUID, db: AsyncSession) -> Club:
    club = await db.get(Club, club_id)
    if not club:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clube não encontrado")
    return club


@router.post("", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    club_id: uuid.UUID,
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Create a new poker session. Only one open session per club is allowed."""
    club = await _get_club(club_id, db)

    existing = await db.execute(
        select(Session).where(Session.club_id == club_id, Session.status == "open")
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Já existe uma sessão aberta neste clube. Encerre a sessão atual antes de criar uma nova.",
        )

    session_data = data.model_dump()
    # Inherit rake defaults from club if not specified
    if session_data.get("rake_buyin") is None:
        session_data["rake_buyin"] = float(club.default_rake_buyin)
    if session_data.get("rake_rebuy") is None:
        session_data["rake_rebuy"] = float(club.default_rake_rebuy)
    # Calculate Kits
    from app.models import ChipDenomination
    res_denoms = await db.execute(
        select(ChipDenomination).where(ChipDenomination.club_id == club_id, ChipDenomination.active == True)
    )
    denominations = list(res_denoms.scalars().all())
    
    table_limit_val = session_data.get("table_limit") or 9
    rake_buyin_val = float(session_data["rake_buyin"])
    rake_rebuy_val = float(session_data["rake_rebuy"])
    buyin_chip_value = float(session_data["buy_in_amount"]) - rake_buyin_val
    rebuy_chip_value = float(session_data["rebuy_amount"]) - rake_rebuy_val
    blinds = session_data["blinds_info"]

    buyin_kit, remaining_inv = calculate_buyin_kit(
        denominations=denominations,
        amount=buyin_chip_value,
        blinds_info=blinds,
        table_limit=table_limit_val
    )

    rebuy_kit = calculate_rebuy_kit(
        denominations=denominations,
        amount=rebuy_chip_value,
        table_limit=table_limit_val,
        remaining_inventory=remaining_inv
    )

    session_data["buyin_kit"] = buyin_kit
    session_data["rebuy_kit"] = rebuy_kit

    session = Session(club_id=club_id, **session_data)
    db.add(session)
    await db.flush()
    return _session_to_response(session)


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    club_id: uuid.UUID,
    status_filter: str | None = None,
    limit: int = 20,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """List sessions for a club with optional status filter, ordered by newest first."""
    await _get_club(club_id, db)

    base_filter = [Session.club_id == club_id]
    if status_filter:
        base_filter.append(Session.status == status_filter)

    total_q = await db.execute(select(func.count(Session.id)).where(*base_filter))
    total = total_q.scalar_one()

    result = await db.execute(
        select(Session)
        .where(*base_filter)
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
async def get_session(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get session details with the full player list and their transactions."""
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id, Session.club_id == club_id)
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
                total_physical_chips=sp.total_physical_chips,
                total_chips_out=sp.total_chips_out,
                joined_at=sp.joined_at,
                transactions=[TransactionResponse.model_validate(t) for t in sp.transactions],
            )
            for sp in session.session_players
        ],
    )


@router.post("/{session_id}/join", response_model=PlayerJoinResponse)
async def join_session(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    data: PlayerJoinRequest,
    db: AsyncSession = Depends(get_db),
):
    """Register a player in a session. Reuses existing player records by phone within the club."""
    session = await db.execute(
        select(Session).where(Session.id == session_id, Session.club_id == club_id)
    )
    session = session.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")
    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão encerrada")

    phone = data.phone  # Already normalized by validator

    # Find or create the player within this club
    result = await db.execute(
        select(Player).where(Player.club_id == club_id, Player.phone == phone)
    )
    player = result.scalar_one_or_none()
    is_returning = False

    if player:
        if player.name != data.name:
            player.name = data.name
    else:
        player = Player(club_id=club_id, name=data.name, phone=phone)
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

    if data.cash_buy_ins > 0:
        added_chips = 0
        added_physical = 0
        for i in range(data.cash_buy_ins):
            is_buyin = (i == 0 and sp.status == "waiting_payment")
            if not is_buyin and not session.allow_rebuys:
                break
                
            amount = float(session.buy_in_amount) if is_buyin else float(session.rebuy_amount)
            rake = float(session.rake_buyin) if is_buyin else float(session.rake_rebuy)
            chip_count = int(amount - rake)
            tx_type = "buy_in" if is_buyin else "rebuy"

            # Get physical count from session kits
            kit = session.buyin_kit if is_buyin else session.rebuy_kit
            physical_count = kit.get("total_chips_count", 0) if kit else 0

            transaction = Transaction(
                session_player_id=sp.id,
                type=tx_type,
                amount=amount,
                chip_count=chip_count,
                physical_chip_count=physical_count,
                rake_amount=rake,
                payment_method="cash",
                status="confirmed",
            )
            db.add(transaction)
            added_chips += chip_count
            added_physical += physical_count
            sp.total_chips_in += chip_count
            sp.total_physical_chips += physical_count
            
        if added_chips > 0:
            sp.status = "active"
            sp.updated_at = datetime.now(timezone.utc)
            await db.flush()
            
            await manager.broadcast(session_id, "payment_confirmed", {
                "player_id": str(sp.player_id),
                "player_name": sp.player.name,
                "type": "buy_in_batch", 
                "chips": added_chips,
                "physical_chips": added_physical
            })

    return PlayerJoinResponse(
        token=sp.token,
        player_url=f"/session/{club_id}/{session_id}/player/{sp.token}",
        player=PlayerBrief(id=player.id, name=player.name, phone=player.phone),
        is_returning=is_returning,
    )


@router.get("/{session_id}/player/{token}", response_model=PlayerSessionResponse)
async def get_player_session(
    club_id: uuid.UUID,
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
    if not sp or sp.session.club_id != club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link inválido")

    from app.services.chip_service import _parse_blind_value
    blind_val = _parse_blind_value(sp.session.blinds_info or "0")
    blinds_count = round(sp.total_chips_in / blind_val, 1) if blind_val > 0 and sp.total_chips_in > 0 else 0

    return PlayerSessionResponse(
        id=sp.id,
        session_id=sp.session_id,
        session_name=sp.session.name,
        player_name=sp.player.name,
        status=sp.status,
        total_chips_in=sp.total_chips_in,
        total_physical_chips=sp.total_physical_chips,
        total_chips_out=sp.total_chips_out,
        blind_value=blind_val,
        blinds_count=blinds_count,
        transactions=[TransactionResponse.model_validate(t) for t in sp.transactions],
    )


@router.get("/{session_id}/player/{token}/history", response_model=PlayerHistoryResponse)
async def get_player_history_by_token(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get a player's session history across all sessions in this club, accessed via their token."""
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id, SessionPlayer.token == token)
        .options(selectinload(SessionPlayer.player))
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link inválido")

    return await _build_player_history(club_id, sp.player, db)


async def _build_player_history(
    club_id: uuid.UUID, player: Player, db: AsyncSession
) -> PlayerHistoryResponse:
    """Build the full history response for a player within a club."""
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.player_id == player.id)
        .options(
            selectinload(SessionPlayer.session),
            selectinload(SessionPlayer.transactions),
        )
        .join(Session)
        .where(Session.club_id == club_id)
        .order_by(Session.created_at.desc())
    )
    session_players = result.scalars().all()

    items = []
    total_net = 0.0
    for sp in session_players:
        confirmed_buyins = [
            t for t in sp.transactions
            if t.type in ("buy_in", "rebuy") and t.status == "confirmed"
        ]
        total_buyin = sum(float(t.amount) for t in confirmed_buyins)
        rebuy_count = sum(1 for t in confirmed_buyins if t.type == "rebuy")
        total_cashout = sp.total_chips_out
        net = float(total_cashout) - float(sp.total_chips_in)

        items.append(PlayerHistoryItem(
            session_id=sp.session_id,
            session_name=sp.session.name,
            session_date=sp.session.created_at,
            total_buyin=total_buyin,
            total_cashout=total_cashout,
            net_result=net,
            rebuy_count=rebuy_count,
        ))
        total_net += net

    return PlayerHistoryResponse(
        player=PlayerBrief(id=player.id, name=player.name, phone=player.phone),
        items=items,
        total_sessions=len(items),
        total_net=total_net,
    )


def _session_to_response(session: Session, player_count: int = 0) -> SessionResponse:
    return SessionResponse(
        id=session.id,
        club_id=session.club_id,
        name=session.name,
        blinds_info=session.blinds_info,
        buy_in_amount=float(session.buy_in_amount),
        rebuy_amount=float(session.rebuy_amount),
        allow_rebuys=session.allow_rebuys,
        rake_buyin=float(session.rake_buyin),
        rake_rebuy=float(session.rake_rebuy),
        status=session.status,
        table_limit=session.table_limit,
        buyin_kit=session.buyin_kit,
        rebuy_kit=session.rebuy_kit,
        created_at=session.created_at,
        closed_at=session.closed_at,
        player_count=player_count,
    )
