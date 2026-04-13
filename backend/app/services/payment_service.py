import uuid
from datetime import datetime, timedelta, timezone

import mercadopago

from app.config import settings


class PaymentService:
    """Wraps the Mercado Pago SDK for Pix payment operations.

    Supports per-club credentials: pass `access_token` to use a club's own MP
    account.  When omitted, the global `settings.mp_access_token` is used.

    When the resolved token is missing or contains the placeholder 'xxxx',
    all calls are intercepted with mock responses for local development.
    """

    def __init__(self) -> None:
        self._global_token = settings.mp_access_token or ""
        self._global_mock = not self._global_token or "xxxx" in self._global_token
        if not self._global_mock:
            self._global_sdk = mercadopago.SDK(self._global_token)

    def _resolve_sdk(self, access_token: str | None = None) -> tuple[bool, mercadopago.SDK | None]:
        """Return (is_mock, sdk) for the given token or the global fallback."""
        if access_token:
            if "xxxx" in access_token:
                return True, None
            return False, mercadopago.SDK(access_token)
        return self._global_mock, getattr(self, "_global_sdk", None)

    def create_pix_payment(
        self,
        amount: float,
        description: str,
        external_reference: str,
        payer_email: str = "",
        access_token: str | None = None,
    ) -> dict:
        """Create a Pix payment and return QR code data.

        Returns dict with keys: mp_payment_id, qr_code_base64, qr_code, expires_at.
        Raises RuntimeError if the MP API call fails.
        """
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.pix_expiration_minutes)
        is_mock, sdk = self._resolve_sdk(access_token)

        if is_mock:
            mock_id = f"mock_{uuid.uuid4().hex[:12]}"
            return {
                "mp_payment_id": mock_id,
                "qr_code_base64": (
                    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4"
                    "2mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
                ),
                "qr_code": (
                    f"00020126580014br.gov.bcb.pix0136{uuid.uuid4()}"
                    f"520400005303986540{amount:.2f}5802BR"
                    f"6009POKERCLUB62070503***6304MOCK"
                ),
                "expires_at": expires_at,
            }

        email = payer_email or "pagamento@pokerclub.com.br"
        payment_data = {
            "transaction_amount": float(amount),
            "payment_method_id": "pix",
            "payer": {"email": email},
            "description": description,
            "external_reference": external_reference,
        }
        result = sdk.payment().create(payment_data)

        if result["status"] not in (200, 201):
            raise RuntimeError(f"Mercado Pago API error: {result.get('response', {})}")

        response = result["response"]
        tx_data = response["point_of_interaction"]["transaction_data"]

        return {
            "mp_payment_id": str(response["id"]),
            "qr_code_base64": tx_data["qr_code_base64"],
            "qr_code": tx_data["qr_code"],
            "expires_at": expires_at,
        }

    def get_payment_status(self, mp_payment_id: str, access_token: str | None = None) -> str:
        """Fetch the current status of a payment from MP API.

        Returns the status string: 'approved', 'pending', 'rejected', etc.
        """
        is_mock, sdk = self._resolve_sdk(access_token)

        if is_mock:
            return "approved"

        result = sdk.payment().get(int(mp_payment_id))
        if result["status"] != 200:
            raise RuntimeError(f"Mercado Pago API error: {result.get('response', {})}")
        return result["response"]["status"]


payment_service = PaymentService()
