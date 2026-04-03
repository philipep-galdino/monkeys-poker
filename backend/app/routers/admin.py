import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import create_access_token, get_current_admin, verify_admin_credentials
from app.database import get_db
from app.models import PaymentPix, Session, SessionPlayer, Transaction
from app.schemas import (
    AdminLogin,
    CashoutRequest,
    CashoutResponse,
    CashPaymentResponse,
    ReconciliationResponse,
    TokenResponse,
    VerifyPaymentResponse,
)
from app.services.payment_service import payment_service
from app.services.websocket_manager import manager

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=TokenResponse)
async def admin_login(data: AdminLogin):
    """Authenticate admin and return a JWT token."""
    if not verify_admin_credentials(data.username, data.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    token = create_access_token(data.username)
    return TokenResponse(access_token=token)


@router.post(
    "/sessions/{session_id}/players/{session_player_id}/cash",
    response_model=CashPaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def mark_cash_payment(
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Mark a player as paid in cash, bypassing Pix entirely."""
    sp = await _get_session_player(session_id, session_player_id, db)
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    amount = float(session.buy_in_amount) if sp.status == "waiting_payment" else float(session.rebuy_amount)
    chip_count = int(amount)

    transaction = Transaction(
        session_player_id=sp.id,
        type="buy_in" if sp.status == "waiting_payment" else "rebuy",
        amount=amount,
        chip_count=chip_count,
        payment_method="cash",
        status="confirmed",
    )
    db.add(transaction)

    sp.total_chips_in += chip_count
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
    "/sessions/{session_id}/players/{session_player_id}/verify",
    response_model=VerifyPaymentResponse,
)
async def verify_payment(
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Poll Mercado Pago API for the latest payment status of a player's pending transaction."""
    sp = await _get_session_player(session_id, session_player_id, db)

    # Find the most recent pending pix payment
    result = await db.execute(
        select(Transaction)
        .where(Transaction.session_player_id == sp.id, Transaction.status == "pending")
        .order_by(Transaction.created_at.desc())
    )
    transaction = result.scalar_one_or_none()
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending transaction found")

    result = await db.execute(
        select(PaymentPix).where(PaymentPix.transaction_id == transaction.id)
    )
    pix = result.scalar_one_or_none()
    if not pix:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No Pix payment record found")

    try:
        mp_status = payment_service.get_payment_status(pix.mp_payment_id)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Mercado Pago API unavailable",
        )

    updated = False
    if mp_status == "approved" and pix.status != "approved":
        pix.status = "approved"
        pix.confirmed_at = datetime.now(timezone.utc)
        transaction.status = "confirmed"
        sp.total_chips_in += transaction.chip_count
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
    "/sessions/{session_id}/players/{session_player_id}/cashout",
    response_model=CashoutResponse,
)
async def cashout_player(
    session_id: uuid.UUID,
    session_player_id: uuid.UUID,
    data: CashoutRequest,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Register a player's cashout with the number of chips returned."""
    sp = await _get_session_player(session_id, session_player_id, db)

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

    sp.total_chips_out = data.chips_returned
    sp.status = "cashed_out"
    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await manager.broadcast(session_id, "player_cashed_out", {
        "player_id": str(sp.player_id),
        "player_name": sp.player.name,
        "chips_out": data.chips_returned,
    })

    return CashoutResponse(
        session_player_id=sp.id,
        total_chips_in=sp.total_chips_in,
        total_chips_out=sp.total_chips_out,
        status=sp.status,
    )


@router.post("/sessions/{session_id}/close", response_model=ReconciliationResponse)
async def close_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: str = Depends(get_current_admin),
):
    """Close a session, cancel pending payments, and return reconciliation summary."""
    session = await db.get(Session, session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Session already closed")

    # Cancel all pending transactions for this session
    result = await db.execute(
        select(SessionPlayer).where(SessionPlayer.session_id == session_id)
    )
    session_players = result.scalars().all()
    sp_ids = [sp.id for sp in session_players]

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
        discrepancy=discrepancy,
        warning=warning,
        cancelled_pending=cancelled_count,
    )


async def _get_session_player(
    session_id: uuid.UUID, session_player_id: uuid.UUID, db: AsyncSession
) -> SessionPlayer:
    """Look up a session_player by ID, ensuring it belongs to the given session."""
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.id == session_player_id, SessionPlayer.session_id == session_id)
        .options(selectinload(SessionPlayer.player))
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found in session")
    return sp
