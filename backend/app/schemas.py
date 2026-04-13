import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator


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


# ── Owner ────────────────────────────────────────────────────────────────────

class OwnerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    phone: str
    password: str = Field(min_length=6, max_length=100)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = normalize_phone(v)
        if len(digits) not in (10, 11):
            raise ValueError("Telefone deve ter 10 ou 11 dígitos (com DDD)")
        return digits


class OwnerResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    phone: str
    created_at: datetime

    model_config = {"from_attributes": True}


class OwnerRegister(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    email: str = Field(min_length=5, max_length=200)
    phone: str
    password: str = Field(min_length=6, max_length=100)
    club_name: str = Field(min_length=1, max_length=200)
    club_slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9\-]+$")

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = normalize_phone(v)
        if len(digits) not in (10, 11):
            raise ValueError("Telefone deve ter 10 ou 11 dígitos (com DDD)")
        return digits


class OwnerLogin(BaseModel):
    email: str
    password: str


class OwnerPasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6, max_length=100)


# ── Club ─────────────────────────────────────────────────────────────────────

class ClubCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9\-]+$")
    description: str | None = None
    default_rake_buyin: float = Field(ge=0, default=0)
    default_rake_rebuy: float = Field(ge=0, default=0)
    allow_multiple_buyins: bool = False
    owner: OwnerCreate | None = None


class ClubUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    default_rake_buyin: float | None = Field(None, ge=0)
    default_rake_rebuy: float | None = Field(None, ge=0)
    allow_multiple_buyins: bool | None = None
    payment_mode: str | None = None
    pix_key: str | None = None
    mp_access_token: str | None = None
    mp_webhook_secret: str | None = None
    # Theme
    logo_url: str | None = None
    primary_color: str | None = None
    accent_color: str | None = None
    bg_color: str | None = None
    text_color: str | None = None
    bg_image_url: str | None = None
    font_family: str | None = None
    tv_layout: str | None = None


class ClubThemeResponse(BaseModel):
    logo_url: str | None = None
    primary_color: str = "#d4a937"
    accent_color: str = "#1a5c38"
    bg_color: str = "#0f1419"
    text_color: str = "#e5e7eb"
    bg_image_url: str | None = None
    font_family: str = "Inter"
    tv_layout: str = "classic"

    model_config = {"from_attributes": True}


class ClubResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    description: str | None
    default_rake_buyin: float
    default_rake_rebuy: float
    allow_multiple_buyins: bool
    payment_mode: str = "static_pix"
    pix_key: str | None = None
    has_mp_credentials: bool = False
    owner: OwnerResponse | None = None
    # Theme
    logo_url: str | None = None
    primary_color: str = "#d4a937"
    accent_color: str = "#1a5c38"
    bg_color: str = "#0f1419"
    text_color: str = "#e5e7eb"
    bg_image_url: str | None = None
    font_family: str = "Inter"
    tv_layout: str = "classic"
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="wrap")
    @classmethod
    def _compute_has_mp(cls, data, handler):  # type: ignore[override]
        # Extract mp_access_token before Pydantic strips it (not in schema fields)
        if hasattr(data, "mp_access_token"):
            token = data.mp_access_token  # ORM object
        elif isinstance(data, dict):
            token = data.get("mp_access_token")
        else:
            token = None
        obj = handler(data)
        obj.has_mp_credentials = bool(token)
        return obj


class ClubPublicResponse(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    logo_url: str | None = None
    primary_color: str = "#d4a937"
    accent_color: str = "#1a5c38"
    bg_color: str = "#0f1419"
    text_color: str = "#e5e7eb"
    font_family: str = "Inter"
    active_session_id: uuid.UUID | None = None

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
    cash_king_enabled: bool = False


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
    pix_key: str | None = None
    payout_amount: float | None = None
    payout_status: str | None = None
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
    cash_king_enabled: bool = False
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
    player_id: uuid.UUID
    player_name: str
    status: str
    total_chips_in: int
    total_physical_chips: int = 0
    total_chips_out: int
    blind_value: float = 0
    blinds_count: float = 0
    cash_king_enabled: bool = False
    transactions: list[TransactionResponse] = []

    model_config = {"from_attributes": True}


# ── Buy-in / Rebuy ──────────────────────────────────────────────────────────

class BuyinResponse(BaseModel):
    transaction_id: uuid.UUID
    payment_mode: str = "mercado_pago"
    amount: float
    # Mercado Pago fields (only when payment_mode == "mercado_pago")
    qr_code_base64: str | None = None
    qr_code: str | None = None
    expires_at: datetime | None = None
    # Static Pix fields (only when payment_mode == "static_pix")
    pix_key: str | None = None


# ── Cash Payment ─────────────────────────────────────────────────────────────

class CashPaymentResponse(BaseModel):
    transaction_id: uuid.UUID
    status: str
    amount: float
    chip_count: int


# ── Cashout ──────────────────────────────────────────────────────────────────

class CashoutRequest(BaseModel):
    chips_returned: int = Field(ge=0)
    pix_key: str | None = None
    croupier_hours: float | None = Field(None, ge=0)


class CashoutResponse(BaseModel):
    session_player_id: uuid.UUID
    total_chips_in: int
    total_chips_out: int
    net_result: int
    payout_amount: float | None
    pix_key: str | None
    payout_status: str | None
    status: str
    cash_king_pts: float | None = None


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


# ── Cash King ────────────────────────────────────────────────────────────────

class CashKingScoreResponse(BaseModel):
    id: uuid.UUID
    player: PlayerBrief
    session_name: str | None = None
    session_date: datetime | None = None
    description: str | None = None
    attendance_pts: float
    hours_pts: float
    croupier_pts: float
    profit_pts: float
    manual_adj: float
    total_pts: float


class CashKingLeaderboardEntry(BaseModel):
    player: PlayerBrief
    total_pts: float
    session_count: int


class CashKingLeaderboardResponse(BaseModel):
    year_month: str
    entries: list[CashKingLeaderboardEntry]


class CashKingEditRequest(BaseModel):
    attendance_pts: float | None = None
    hours_pts: float | None = None
    croupier_pts: float | None = None
    profit_pts: float | None = None
    manual_adj: float | None = None


class CashKingManualCreate(BaseModel):
    player_id: uuid.UUID
    year_month: str | None = None
    description: str | None = Field(None, max_length=200)
    attendance_pts: float = 0
    hours_pts: float = 0
    croupier_pts: float = 0
    profit_pts: float = 0
    manual_adj: float = 0


# ── Health ───────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    database: str
