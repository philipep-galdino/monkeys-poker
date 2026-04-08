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


# ── Club ─────────────────────────────────────────────────────────────────────

class ClubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9\-]+$")
    description: str | None = None
    default_rake_buyin: float = Field(ge=0, default=0)
    default_rake_rebuy: float = Field(ge=0, default=0)
    allow_multiple_buyins: bool = False


class ClubUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    default_rake_buyin: float | None = Field(None, ge=0)
    default_rake_rebuy: float | None = Field(None, ge=0)
    allow_multiple_buyins: bool | None = None


class ClubResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    default_rake_buyin: float
    default_rake_rebuy: float
    allow_multiple_buyins: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class ClubListResponse(BaseModel):
    items: list[ClubResponse]
    total: int


# ── Chip Denominations ──────────────────────────────────────────────────────

class ChipDenominationItem(BaseModel):
    label: str = Field(min_length=1, max_length=50)
    value: float = Field(gt=0)
    quantity: int = Field(ge=0, default=0)
    color: str | None = None
    active: bool = True
    sort_order: int = 0


class ChipDenominationResponse(ChipDenominationItem):
    id: uuid.UUID

    model_config = {"from_attributes": True}


class ChipBreakdownItem(BaseModel):
    value: float
    label: str
    color: str | None
    count: int


class ChipBreakdownResponse(BaseModel):
    items: list[ChipBreakdownItem]
    total_value: float
    total_chips_count: int = 0
    remainder: float


# ── Session ──────────────────────────────────────────────────────────────────

class SessionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    blinds_info: str = Field(min_length=1, max_length=100)
    buy_in_amount: float = Field(gt=0)
    rebuy_amount: float = Field(gt=0)
    allow_rebuys: bool = True
    rake_buyin: float | None = Field(None, ge=0)
    rake_rebuy: float | None = Field(None, ge=0)
    table_limit: int | None = Field(None, ge=1)


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
    physical_chip_count: int = 0
    rake_amount: float = 0
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
    total_physical_chips: int = 0
    total_chips_out: int
    joined_at: datetime
    transactions: list[TransactionResponse] = []

    model_config = {"from_attributes": True}


class SessionResponse(BaseModel):
    id: uuid.UUID
    club_id: uuid.UUID
    name: str
    blinds_info: str
    buy_in_amount: float
    rebuy_amount: float
    allow_rebuys: bool
    rake_buyin: float = 0
    rake_rebuy: float = 0
    status: str
    table_limit: int | None = None
    buyin_kit: dict | None = None
    rebuy_kit: dict | None = None
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
    cash_buy_ins: int = Field(0, ge=0)

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
    total_physical_chips: int = 0
    total_chips_out: int
    blind_value: float = 0
    blinds_count: float = 0
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

class SessionCloseRequest(BaseModel):
    force: bool = False


class ClosePreviewPlayer(BaseModel):
    id: uuid.UUID
    name: str
    total_chips_in: int
    total_physical_chips: int = 0


class ClosePreviewResponse(BaseModel):
    uncashed_players: list[ClosePreviewPlayer]
    session_id: uuid.UUID


class ReconciliationResponse(BaseModel):
    session_id: uuid.UUID
    status: str
    total_chips_sold: int
    total_chips_returned: int
    total_collected_pix: float
    total_collected_cash: float
    total_rake: float = 0
    discrepancy: int
    warning: str | None = None
    cancelled_pending: int = 0


# ── Verify Payment ───────────────────────────────────────────────────────────

class VerifyPaymentResponse(BaseModel):
    mp_payment_id: str
    mp_status: str
    local_status: str
    updated: bool


# ── Player History ───────────────────────────────────────────────────────────

class PlayerHistoryItem(BaseModel):
    session_id: uuid.UUID
    session_name: str
    session_date: datetime
    total_buyin: float
    total_cashout: int
    net_result: float
    rebuy_count: int


class PlayerHistoryResponse(BaseModel):
    player: PlayerBrief
    items: list[PlayerHistoryItem]
    total_sessions: int
    total_net: float


# ── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    database: str
