import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


# ── Helpers ──────────────────────────────────────────────────────────────────

def normalize_phone(phone: str) -> str:
    """Strip all non-digit characters from a phone number."""
    return "".join(c for c in phone if c.isdigit())


# ── Auth ─────────────────────────────────────────────────────────────────────

class AdminLogin(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Session ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    blinds_info: str = Field(min_length=1, max_length=100)
    buy_in_amount: float = Field(gt=0)
    rebuy_amount: float = Field(gt=0)
    allow_rebuys: bool = True


class PlayerBrief(BaseModel):
    id: uuid.UUID
    name: str
    phone: str

    model_config = {"from_attributes": True}


class TransactionResponse(BaseModel):
    id: uuid.UUID
    type: str
    amount: float
    chip_count: int
    payment_method: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SessionPlayerResponse(BaseModel):
    id: uuid.UUID
    player: PlayerBrief
    token: uuid.UUID
    status: str
    total_chips_in: int
    total_chips_out: int
    joined_at: datetime
    transactions: list[TransactionResponse] = []

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: uuid.UUID
    name: str
    blinds_info: str
    buy_in_amount: float
    rebuy_amount: float
    allow_rebuys: bool
    status: str
    created_at: datetime
    closed_at: datetime | None
    player_count: int = 0

    model_config = {"from_attributes": True}


class SessionDetailResponse(SessionResponse):
    session_players: list[SessionPlayerResponse] = []


class SessionListResponse(BaseModel):
    items: list[SessionResponse]
    total: int


# ── Player Join ──────────────────────────────────────────────────────────────

class PlayerJoinRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = normalize_phone(v)
        if len(digits) not in (10, 11):
            raise ValueError("Telefone deve ter 10 ou 11 dígitos (com DDD)")
        return digits


class PlayerJoinResponse(BaseModel):
    token: uuid.UUID
    player_url: str
    player: PlayerBrief
    is_returning: bool


# ── Player Session ───────────────────────────────────────────────────────────

class PlayerSessionResponse(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    session_name: str
    player_name: str
    status: str
    total_chips_in: int
    total_chips_out: int
    transactions: list[TransactionResponse] = []

    model_config = {"from_attributes": True}


# ── Buy-in / Rebuy ──────────────────────────────────────────────────────────

class BuyinResponse(BaseModel):
    transaction_id: uuid.UUID
    qr_code_base64: str
    qr_code: str
    amount: float
    expires_at: datetime


# ── Cash Payment ─────────────────────────────────────────────────────────────

class CashPaymentResponse(BaseModel):
    transaction_id: uuid.UUID
    status: str
    amount: float
    chip_count: int


# ── Cashout ──────────────────────────────────────────────────────────────────

class CashoutRequest(BaseModel):
    chips_returned: int = Field(ge=0)


class CashoutResponse(BaseModel):
    session_player_id: uuid.UUID
    total_chips_in: int
    total_chips_out: int
    status: str


# ── Session Close / Reconciliation ───────────────────────────────────────────

class ReconciliationResponse(BaseModel):
    session_id: uuid.UUID
    status: str
    total_chips_sold: int
    total_chips_returned: int
    total_collected_pix: float
    total_collected_cash: float
    discrepancy: int
    warning: str | None = None
    cancelled_pending: int = 0


# ── Verify Payment ───────────────────────────────────────────────────────────

class VerifyPaymentResponse(BaseModel):
    mp_payment_id: str
    mp_status: str
    local_status: str
    updated: bool


# ── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    database: str
