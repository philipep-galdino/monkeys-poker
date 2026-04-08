import hashlib
import hmac
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import async_session
from app.models import PaymentPix, SessionPlayer, Transaction
from app.services.payment_service import payment_service
from app.services.websocket_manager import manager

logger = logging.getLogger(__name__)

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
    sp.total_physical_chips += transaction.physical_chip_count
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


def _verify_mp_signature(request: Request, data_id: str) -> bool:
    """Validate Mercado Pago webhook signature using HMAC-SHA256.

    MP sends:
      x-signature: ts=<timestamp>,v1=<hash>
      x-request-id: <request-id>

    Manifest to sign: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
    """
    secret = settings.mp_webhook_secret
    if not secret:
        # No secret configured — skip validation (dev/mock mode)
        return True

    sig_header = request.headers.get("x-signature", "")
    request_id = request.headers.get("x-request-id", "")

    if not sig_header:
        logger.warning("Webhook missing x-signature header")
        return False

    # Parse "ts=123456,v1=abcdef..." from header
    parts = {}
    for part in sig_header.split(","):
        kv = part.split("=", 1)
        if len(kv) == 2:
            parts[kv[0].strip()] = kv[1].strip()

    ts = parts.get("ts", "")
    v1 = parts.get("v1", "")
    if not ts or not v1:
        logger.warning("Webhook x-signature missing ts or v1")
        return False

    # Build the manifest string per MP docs
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, v1):
        logger.warning("Webhook signature mismatch")
        return False

    return True


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

    if not _verify_mp_signature(request, mp_payment_id):
        logger.warning("Rejected webhook with invalid signature for payment %s", mp_payment_id)
        return JSONResponse({"status": "invalid_signature"})

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
        logger.exception("Error processing webhook for payment %s", mp_payment_id)

    return JSONResponse({"status": "ok"})
