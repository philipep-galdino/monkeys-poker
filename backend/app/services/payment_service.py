import uuid
from datetime import datetime, timedelta, timezone

import mercadopago

from app.config import settings


class PaymentService:
    """Wraps the Mercado Pago SDK for Pix payment operations.

    All MP API interactions go through this class so route handlers
    never touch the SDK directly — makes testing and mocking straightforward.

    When MP_ACCESS_TOKEN is missing or contains the placeholder 'xxxx',
    all calls are intercepted with mock responses for local development.
    """

    def __init__(self) -> None:
        self._mock = not settings.mp_access_token or "xxxx" in settings.mp_access_token
        if not self._mock:
            self._sdk = mercadopago.SDK(settings.mp_access_token)

    def create_pix_payment(
        self,
        amount: float,
        description: str,
        external_reference: str,
        payer_email: str = "",
    ) -> dict:
        """Create a Pix payment and return QR code data.

        Returns dict with keys: mp_payment_id, qr_code_base64, qr_code, expires_at.
        Raises RuntimeError if the MP API call fails.
        """
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.pix_expiration_minutes)

        if self._mock:
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

        email = payer_email or "pagamento@pokerclub.local"
        payment_data = {
            "transaction_amount": float(amount),
            "payment_method_id": "pix",
            "payer": {"email": email},
            "description": description,
            "external_reference": external_reference,
        }
        result = self._sdk.payment().create(payment_data)

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

    def get_payment_status(self, mp_payment_id: str) -> str:
        """Fetch the current status of a payment from MP API.

        Returns the status string: 'approved', 'pending', 'rejected', etc.
        """
        if self._mock:
            return "approved"

        result = self._sdk.payment().get(int(mp_payment_id))
        if result["status"] != 200:
            raise RuntimeError(f"Mercado Pago API error: {result.get('response', {})}")
        return result["response"]["status"]


payment_service = PaymentService()
