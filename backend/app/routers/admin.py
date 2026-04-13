import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import AuthUser, create_access_token, get_current_admin, get_current_superadmin, verify_admin_credentials
from app.permissions import assert_club_access
from app.database import get_db
from app.models import CashKingScore, Club, ClubOwner, PaymentPix, Player, Session, SessionPlayer, Transaction
from app.schemas import (
    AdminLogin,
    CashoutRequest,
    CashoutResponse,
    CashPaymentResponse,
    ClosePreviewPlayer,
    ClosePreviewResponse,
    OwnerCreate,
    OwnerResponse,
    PlayerHistoryResponse,
    ReconciliationResponse,
    SessionCloseRequest,
    TokenResponse,
    VerifyPaymentResponse,
)
from app.routers.sessions import _build_player_history
from app.services.payment_service import payment_service
from app.services.websocket_manager import manager

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=TokenResponse)
async def admin_login(data: AdminLogin):
    """Authenticate admin and return a JWT token."""
    if not verify_admin_credentials(data.username, data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciais inválidas",
        )
    token = create_access_token(data.username)
    return TokenResponse(access_token=token)


@router.post("/owners", response_model=OwnerResponse, status_code=status.HTTP_201_CREATED)
async def create_owner(
    data: OwnerCreate,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_superadmin),
):
    """Superadmin: create a new club owner."""
    import bcrypt

    existing = await db.execute(select(ClubOwner).where(ClubOwner.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    password_hash = bcrypt.hashpw(data.password.encode(), bcrypt.gensalt()).decode()
    owner = ClubOwner(
        name=data.name,
        email=data.email,
        phone=data.phone,
        password_hash=password_hash,
    )
    db.add(owner)
    await db.flush()
    return OwnerResponse.model_validate(owner)


@router.get("/owners", response_model=list[OwnerResponse])
async def list_owners(
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_superadmin),
):
    """Superadmin: list all club owners."""
    result = await db.execute(select(ClubOwner).order_by(ClubOwner.created_at.desc()))
    return [OwnerResponse.model_validate(o) for o in result.scalars().all()]


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/players/{session_player_id}/cash",
    response_model=CashPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def mark_cash_payment(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Mark a player as paid in cash, bypassing Pix entirely."""
    sp = await _get_session_player(club_id, session_id, session_player_id, db, _admin)
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")

    # Cancel any pending Pix transactions for this player
    pending_result = await db.execute(
        select(Transaction).where(
            Transaction.session_player_id == sp.id,
            Transaction.status == "pending",
        )
    )
    for pending_tx in pending_result.scalars().all():
        pending_tx.status = "cancelled"
        pix_result = await db.execute(
            select(PaymentPix).where(PaymentPix.transaction_id == pending_tx.id)
        )
        pix = pix_result.scalar_one_or_none()
        if pix:
            pix.status = "expired"

    is_buyin = sp.status == "waiting_payment"
    amount = float(session.buy_in_amount) if is_buyin else float(session.rebuy_amount)
    rake = float(session.rake_buyin) if is_buyin else float(session.rake_rebuy)
    chip_count = int(amount - rake)

    # Get physical count from session kits
    kit = session.buyin_kit if is_buyin else session.rebuy_kit
    physical_count = kit.get("total_chips_count", 0) if kit else 0

    transaction = Transaction(
        session_player_id=sp.id,
        type="buy_in" if is_buyin else "rebuy",
        amount=amount,
        chip_count=chip_count,
        physical_chip_count=physical_count,
        rake_amount=rake,
        payment_method="cash",
        status="confirmed",
    )
    db.add(transaction)

    sp.total_chips_in += chip_count
    sp.total_physical_chips += physical_count
    if sp.status == "waiting_payment":
        sp.status = "active"
    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await manager.broadcast(session_id, "payment_confirmed", {
        "player_id": str(sp.player_id),
        "player_name": sp.player.name,
        "type": transaction.type,
        "chips": chip_count,
    })

    return CashPaymentResponse(
        transaction_id=transaction.id,
        status=transaction.status,
        amount=float(transaction.amount),
        chip_count=chip_count,
    )


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/players/{session_player_id}/rebuy-cash",
    response_model=CashPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def rebuy_cash(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Give an active player a cash rebuy."""
    sp = await _get_session_player(club_id, session_id, session_player_id, db, _admin)
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")

    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão encerrada")
    if not session.allow_rebuys:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rebuys não permitidos nesta sessão")
    if sp.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jogador precisa estar ativo para rebuy")

    # Cancel any pending Pix rebuy transactions
    pending_result = await db.execute(
        select(Transaction).where(
            Transaction.session_player_id == sp.id,
            Transaction.type == "rebuy",
            Transaction.status == "pending",
        )
    )
    for pending_tx in pending_result.scalars().all():
        pending_tx.status = "cancelled"
        pix_result = await db.execute(
            select(PaymentPix).where(PaymentPix.transaction_id == pending_tx.id)
        )
        pix = pix_result.scalar_one_or_none()
        if pix:
            pix.status = "expired"

    amount = float(session.rebuy_amount)
    rake = float(session.rake_rebuy)
    chip_count = int(amount - rake)

    kit = session.rebuy_kit
    physical_count = kit.get("total_chips_count", 0) if kit else 0

    transaction = Transaction(
        session_player_id=sp.id,
        type="rebuy",
        amount=amount,
        chip_count=chip_count,
        physical_chip_count=physical_count,
        rake_amount=rake,
        payment_method="cash",
        status="confirmed",
    )
    db.add(transaction)

    sp.total_chips_in += chip_count
    sp.total_physical_chips += physical_count
    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await manager.broadcast(session_id, "payment_confirmed", {
        "player_id": str(sp.player_id),
        "player_name": sp.player.name,
        "type": "rebuy",
        "chips": chip_count,
    })

    return CashPaymentResponse(
        transaction_id=transaction.id,
        status=transaction.status,
        amount=float(transaction.amount),
        chip_count=chip_count,
    )


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/players/{session_player_id}/verify",
    response_model=VerifyPaymentResponse,
)
async def verify_payment(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Poll Mercado Pago API for the latest payment status of a player's pending transaction."""
    sp = await _get_session_player(club_id, session_id, session_player_id, db, _admin)

    # Find the most recent pending pix payment
    result = await db.execute(
        select(Transaction)
        .where(Transaction.session_player_id == sp.id, Transaction.status == "pending")
        .order_by(Transaction.created_at.desc())
        .limit(1)
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Nenhuma transação pendente encontrada")

    result = await db.execute(
        select(PaymentPix).where(PaymentPix.transaction_id == transaction.id)
    )
    pix = result.scalar_one_or_none()
    if not pix:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro de pagamento Pix não encontrado")

    # Use club's MP credentials if available
    club = await db.get(Club, club_id)
    club_token = (club.mp_access_token if club else None) or None

    try:
        mp_status = payment_service.get_payment_status(pix.mp_payment_id, access_token=club_token)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="API do Mercado Pago indisponível",
        )

    updated = False
    if mp_status == "approved" and pix.status != "approved":
        pix.status = "approved"
        pix.confirmed_at = datetime.now(timezone.utc)
        transaction.status = "confirmed"
        sp.total_chips_in += transaction.chip_count
        sp.total_physical_chips += transaction.physical_chip_count
        if sp.status == "waiting_payment":
            sp.status = "active"
        sp.updated_at = datetime.now(timezone.utc)
        updated = True

        await manager.broadcast(session_id, "payment_confirmed", {
            "player_id": str(sp.player_id),
            "player_name": sp.player.name,
            "type": transaction.type,
            "chips": transaction.chip_count,
        })

    await db.flush()
    return VerifyPaymentResponse(
        mp_payment_id=pix.mp_payment_id,
        mp_status=mp_status,
        local_status=pix.status,
        updated=updated,
    )


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/players/{session_player_id}/cashout",
    response_model=CashoutResponse,
)
async def cashout_player(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    data: CashoutRequest,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Register a player's cashout with the number of chips returned.

    If chips_returned > total_chips_in the player won, and the net positive
    amount becomes a payout.  The admin can optionally supply the player's
    pix_key so it's recorded for manual (or future automatic) transfer.
    """
    sp = await _get_session_player(club_id, session_id, session_player_id, db, _admin)

    if sp.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jogador não possui fichas")

    transaction = Transaction(
        session_player_id=sp.id,
        type="cash_out",
        amount=0,
        chip_count=data.chips_returned,
        payment_method=None,
        status="confirmed",
    )
    db.add(transaction)

    net_result = data.chips_returned - sp.total_chips_in
    payout_amount = float(data.chips_returned) if data.chips_returned > 0 else None

    sp.total_chips_out = data.chips_returned
    sp.pix_key = data.pix_key or None
    sp.payout_amount = payout_amount
    sp.payout_status = "pending" if payout_amount else None
    sp.croupier_hours = data.croupier_hours
    sp.status = "cashed_out"
    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    # Cash King scoring
    cash_king_pts = None
    session = sp.session
    if session.cash_king_enabled:
        cash_king_pts = await _create_cash_king_score(session, sp, db)

    await manager.broadcast(session_id, "player_cashed_out", {
        "player_id": str(sp.player_id),
        "player_name": sp.player.name,
        "chips_out": data.chips_returned,
    })

    return CashoutResponse(
        session_player_id=sp.id,
        total_chips_in=sp.total_chips_in,
        total_chips_out=sp.total_chips_out,
        net_result=net_result,
        payout_amount=payout_amount,
        pix_key=sp.pix_key,
        payout_status=sp.payout_status,
        status=sp.status,
        cash_king_pts=cash_king_pts,
    )


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/players/{session_player_id}/mark-paid",
)
async def mark_payout_paid(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Mark a player's payout as manually paid by the admin."""
    sp = await _get_session_player(club_id, session_id, session_player_id, db, _admin)

    if sp.payout_status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nenhum pagamento pendente")

    sp.payout_status = "paid"
    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    return {"status": "paid", "session_player_id": str(sp.id)}


@router.get(
    "/clubs/{club_id}/sessions/{session_id}/close-preview",
    response_model=ClosePreviewResponse,
)
async def close_preview(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Preview which players have not cashed out before closing a session."""
    session = await _get_session(club_id, session_id, db, _admin)
    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão já encerrada")

    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id, SessionPlayer.status == "active")
        .options(selectinload(SessionPlayer.player))
    )
    uncashed = result.scalars().all()

    return ClosePreviewResponse(
        session_id=session_id,
        uncashed_players=[
            ClosePreviewPlayer(
                id=sp.id,
                name=sp.player.name,
                total_chips_in=sp.total_chips_in,
                total_physical_chips=sp.total_physical_chips,
            )
            for sp in uncashed
        ],
    )


@router.post(
    "/clubs/{club_id}/sessions/{session_id}/close",
    response_model=ReconciliationResponse,
)
async def close_session(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    data: SessionCloseRequest = SessionCloseRequest(),
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Close a session, cancel pending payments, and return reconciliation summary.

    If force=False and there are uncashed active players, returns 409 with the list.
    If force=True, auto-cashouts active players with chips_out=0 before closing.
    """
    session = await _get_session(club_id, session_id, db, _admin)
    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão já encerrada")

    # Fetch all session players
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id)
        .options(selectinload(SessionPlayer.player))
    )
    session_players = result.scalars().all()
    sp_ids = [sp.id for sp in session_players]

    # Check for uncashed active players
    active_players = [sp for sp in session_players if sp.status == "active"]
    if active_players and not data.force:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Existem jogadores que não fizeram cashout.",
                "uncashed_players": [
                    {"id": str(sp.id), "name": sp.player.name, "total_chips_in": sp.total_chips_in}
                    for sp in active_players
                ],
            },
        )

    # Auto-cashout active players with chips_out=0
    for sp in active_players:
        tx = Transaction(
            session_player_id=sp.id,
            type="cash_out",
            amount=0,
            chip_count=0,
            payment_method=None,
            status="confirmed",
        )
        db.add(tx)
        sp.total_chips_out = 0
        sp.status = "cashed_out"
        sp.updated_at = datetime.now(timezone.utc)
        if session.cash_king_enabled:
            await _create_cash_king_score(session, sp, db)

    # Cancel all pending transactions
    cancelled_count = 0
    if sp_ids:
        result = await db.execute(
            select(Transaction).where(
                Transaction.session_player_id.in_(sp_ids),
                Transaction.status == "pending",
            )
        )
        pending_txs = result.scalars().all()
        for tx in pending_txs:
            tx.status = "cancelled"
            cancelled_count += 1
            pix_result = await db.execute(
                select(PaymentPix).where(PaymentPix.transaction_id == tx.id)
            )
            pix = pix_result.scalar_one_or_none()
            if pix:
                pix.status = "expired"

    # Calculate reconciliation
    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.chip_count), 0)).where(
            Transaction.session_player_id.in_(sp_ids),
            Transaction.type.in_(["buy_in", "rebuy"]),
            Transaction.status == "confirmed",
        )
    )
    total_chips_sold = int(result.scalar_one())

    total_chips_returned = sum(sp.total_chips_out for sp in session_players)

    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.session_player_id.in_(sp_ids),
            Transaction.status == "confirmed",
            Transaction.payment_method == "pix",
            Transaction.type.in_(["buy_in", "rebuy"]),
        )
    )
    total_pix = float(result.scalar_one())

    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.session_player_id.in_(sp_ids),
            Transaction.status == "confirmed",
            Transaction.payment_method == "cash",
            Transaction.type.in_(["buy_in", "rebuy"]),
        )
    )
    total_cash = float(result.scalar_one())

    result = await db.execute(
        select(func.coalesce(func.sum(Transaction.rake_amount), 0)).where(
            Transaction.session_player_id.in_(sp_ids),
            Transaction.status == "confirmed",
            Transaction.type.in_(["buy_in", "rebuy"]),
        )
    )
    total_rake = float(result.scalar_one())

    # Close the session
    session.status = "closed"
    session.closed_at = datetime.now(timezone.utc)
    session.updated_at = datetime.now(timezone.utc)
    await db.flush()

    discrepancy = total_chips_sold - total_chips_returned
    warning = None
    if discrepancy != 0:
        warning = f"Discrepância de {abs(discrepancy)} fichas"

    await manager.broadcast(session_id, "session_closed", {"session_id": str(session_id)})

    return ReconciliationResponse(
        session_id=session_id,
        status="closed",
        total_chips_sold=total_chips_sold,
        total_chips_returned=total_chips_returned,
        total_collected_pix=total_pix,
        total_collected_cash=total_cash,
        total_rake=total_rake,
        discrepancy=discrepancy,
        warning=warning,
        cancelled_pending=cancelled_count,
    )


@router.get(
    "/clubs/{club_id}/players/{player_id}/history",
    response_model=PlayerHistoryResponse,
)
async def get_player_history(
    club_id: uuid.UUID,
    player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: AuthUser = Depends(get_current_admin),
):
    """Admin endpoint to see a player's full activity history across all sessions in the club."""
    player = await db.get(Player, player_id)
    if not player or player.club_id != club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Jogador não encontrado")
        
    return await _build_player_history(club_id, player, db)


async def _create_cash_king_score(
    session: Session, sp: SessionPlayer, db: AsyncSession
) -> float:
    """Calculate and store Cash King points for a cashed-out player. Returns total_pts."""
    now = datetime.now(timezone.utc)
    hours_played = max(0, (now - sp.joined_at).total_seconds() / 3600)

    attendance_pts = 2.0
    hours_pts = round(2.0 * hours_played, 2)
    croupier_pts = round(2.0 * float(sp.croupier_hours or 0), 2)

    profit = sp.total_chips_out - sp.total_chips_in
    if profit > 0 and float(session.buy_in_amount) > 0:
        buyins_of_profit = profit / float(session.buy_in_amount)
        profit_pts = round(3.0 * buyins_of_profit, 2)
    else:
        profit_pts = 0.0

    total = round(attendance_pts + hours_pts + croupier_pts + profit_pts, 2)
    year_month = now.strftime("%Y-%m")

    score = CashKingScore(
        club_id=session.club_id,
        player_id=sp.player_id,
        session_player_id=sp.id,
        year_month=year_month,
        attendance_pts=attendance_pts,
        hours_pts=hours_pts,
        croupier_pts=croupier_pts,
        profit_pts=profit_pts,
        manual_adj=0,
        total_pts=total,
    )
    db.add(score)
    await db.flush()
    return total


async def _get_session(
    club_id: uuid.UUID, session_id: uuid.UUID, db: AsyncSession, auth: AuthUser
) -> Session:
    await assert_club_access(club_id, auth, db)
    session = await db.get(Session, session_id)
    if not session or session.club_id != club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sessão não encontrada")
    return session


async def _get_session_player(
    club_id: uuid.UUID,
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession,
    auth: AuthUser,
) -> SessionPlayer:
    """Look up a session_player by ID, ensuring caller has access to the club."""
    await assert_club_access(club_id, auth, db)
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.id == session_player_id, SessionPlayer.session_id == session_id)
        .options(selectinload(SessionPlayer.player), selectinload(SessionPlayer.session))
    )
    sp = result.scalar_one_or_none()
    if not sp or sp.session.club_id != club_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Jogador não encontrado na sessão")
    return sp
