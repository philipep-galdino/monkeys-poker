from datetime import datetime, timezone

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import async_session
from app.models import PaymentPix, SessionPlayer, Transaction
from app.services.payment_service import payment_service
from app.services.websocket_manager import manager

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


async def _process_approved_payment(
    pix: PaymentPix,
    transaction: Transaction,
    sp: SessionPlayer,
    db: AsyncSession,
) -> None:
    """Update all records when a payment is approved and broadcast the event."""
    pix.status = "approved"
    pix.confirmed_at = datetime.now(timezone.utc)
    transaction.status = "confirmed"

    sp.total_chips_in += transaction.chip_count
    if sp.status == "waiting_payment":
        sp.status = "active"

    sp.updated_at = datetime.now(timezone.utc)
    await db.flush()

    await manager.broadcast(sp.session_id, "payment_confirmed", {
        "player_id": str(sp.player_id),
        "player_name": sp.player.name if sp.player else "Unknown",
        "type": transaction.type,
        "chips": transaction.chip_count,
    })


async def _process_rejected_payment(
    pix: PaymentPix, transaction: Transaction, db: AsyncSession
) -> None:
    """Mark a payment as expired/cancelled when rejected by MP."""
    pix.status = "expired"
    transaction.status = "cancelled"
    await db.flush()


@router.post("/mercadopago", status_code=status.HTTP_200_OK)
async def mercadopago_webhook(request: Request):
    """Handle Mercado Pago payment notifications.

    Always returns 200 to prevent MP from retrying indefinitely.
    Only processes 'payment' type notifications — ignores all others.
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"status": "ok"})

    if body.get("type") != "payment":
        return JSONResponse({"status": "ignored"})

    mp_payment_id = str(body.get("data", {}).get("id", ""))
    if not mp_payment_id:
        return JSONResponse({"status": "no_payment_id"})

    try:
        async with async_session() as db:
            result = await db.execute(
                select(PaymentPix)
                .where(PaymentPix.mp_payment_id == mp_payment_id)
                .options(
                    selectinload(PaymentPix.transaction)
                    .selectinload(Transaction.session_player)
                    .selectinload(SessionPlayer.player),
                )
            )
            pix = result.scalar_one_or_none()

            if not pix:
                return JSONResponse({"status": "not_found"})

            # Idempotency: already processed
            if pix.status == "approved":
                return JSONResponse({"status": "already_processed"})

            # Fetch current status from MP API
            try:
                mp_status = payment_service.get_payment_status(mp_payment_id)
            except Exception:
                return JSONResponse({"status": "mp_api_error"})

            transaction = pix.transaction
            sp = transaction.session_player

            if mp_status == "approved":
                await _process_approved_payment(pix, transaction, sp, db)
            elif mp_status in ("rejected", "cancelled"):
                await _process_rejected_payment(pix, transaction, db)
            elif mp_status in ("refunded", "charged_back"):
                await _process_rejected_payment(pix, transaction, db)
                await manager.broadcast(sp.session_id, "payment_cancelled", {
                    "player_id": str(sp.player_id),
                    "player_name": sp.player.name if sp.player else "Unknown",
                    "reason": mp_status,
                })
            # in_process, in_mediation → no action, keep as pending

            await db.commit()

    except Exception:
        pass  # Always return 200

    return JSONResponse({"status": "ok"})
