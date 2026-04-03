import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models import PaymentPix, Session, SessionPlayer, Transaction
from app.schemas import BuyinResponse, TransactionResponse
from app.services.payment_service import payment_service
from app.services.websocket_manager import manager

router = APIRouter(prefix="/sessions/{session_id}/player/{token}", tags=["players"])


async def _get_session_player(
    session_id: uuid.UUID, token: uuid.UUID, db: AsyncSession
) -> tuple[Session, SessionPlayer]:
    """Shared lookup for session + session_player by token. Raises 404 if not found."""
    result = await db.execute(
        select(SessionPlayer)
        .where(SessionPlayer.session_id == session_id, SessionPlayer.token == token)
        .options(selectinload(SessionPlayer.session), selectinload(SessionPlayer.transactions))
    )
    sp = result.scalar_one_or_none()
    if not sp:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link inválido")
    return sp.session, sp


async def _create_pix_transaction(
    session: Session,
    sp: SessionPlayer,
    tx_type: str,
    amount: float,
    db: AsyncSession,
) -> BuyinResponse:
    """Shared logic for buy-in and rebuy: check for pending, create MP payment, store records."""
    # Check for existing pending transaction of same type
    for tx in sp.transactions:
        if tx.type == tx_type and tx.status == "pending":
            result = await db.execute(
                select(PaymentPix).where(PaymentPix.transaction_id == tx.id)
            )
            existing_pix = result.scalar_one_or_none()
            if existing_pix:
                return BuyinResponse(
                    transaction_id=tx.id,
                    qr_code_base64=existing_pix.qr_code_base64,
                    qr_code=existing_pix.qr_code,
                    amount=float(tx.amount),
                    expires_at=existing_pix.expires_at,
                )

    chip_count = int(amount)
    description = f"{'Buy-in' if tx_type == 'buy_in' else 'Rebuy'} {session.name}"

    # Create transaction record first (we need its ID for external_reference)
    transaction = Transaction(
        session_player_id=sp.id,
        type=tx_type,
        amount=amount,
        chip_count=chip_count,
        payment_method="pix",
        status="pending",
    )
    db.add(transaction)
    await db.flush()

    # Call MP API — if it fails, rollback the transaction record
    try:
        mp_data = payment_service.create_pix_payment(
            amount=amount,
            description=description,
            external_reference=str(transaction.id),
        )
    except Exception:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Serviço de pagamento indisponível. Tente novamente em alguns instantes.",
        )

    pix = PaymentPix(
        transaction_id=transaction.id,
        mp_payment_id=mp_data["mp_payment_id"],
        qr_code_base64=mp_data["qr_code_base64"],
        qr_code=mp_data["qr_code"],
        expires_at=mp_data["expires_at"],
    )
    db.add(pix)
    await db.flush()

    return BuyinResponse(
        transaction_id=transaction.id,
        qr_code_base64=pix.qr_code_base64,
        qr_code=pix.qr_code,
        amount=float(amount),
        expires_at=pix.expires_at,
    )


@router.post("/buyin", response_model=BuyinResponse, status_code=status.HTTP_201_CREATED)
async def create_buyin(
    session_id: uuid.UUID,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Generate a Pix QR code for the player's buy-in."""
    session, sp = await _get_session_player(session_id, token, db)

    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão encerrada")

    return await _create_pix_transaction(session, sp, "buy_in", float(session.buy_in_amount), db)


@router.post("/rebuy", response_model=BuyinResponse, status_code=status.HTTP_201_CREATED)
async def create_rebuy(
    session_id: uuid.UUID,
    token: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Generate a Pix QR code for a rebuy."""
    session, sp = await _get_session_player(session_id, token, db)

    if session.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sessão encerrada")
    if not session.allow_rebuys:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rebuys não permitidos")
    if sp.status == "cashed_out":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jogador já encerrou a sessão")
    if sp.status != "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Jogador precisa ter um buy-in ativo")

    return await _create_pix_transaction(session, sp, "rebuy", float(session.rebuy_amount), db)
