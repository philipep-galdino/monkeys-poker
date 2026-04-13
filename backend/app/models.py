import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class Base(DeclarativeBase):
    pass


class ClubOwner(Base):
    __tablename__ = "club_owners"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    clubs: Mapped[list["Club"]] = relationship(back_populates="owner")


class Club(Base):
    __tablename__ = "clubs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("club_owners.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    default_rake_buyin: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    default_rake_rebuy: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    allow_multiple_buyins: Mapped[bool] = mapped_column(Boolean, server_default=text("false"), default=False)
    payment_mode: Mapped[str] = mapped_column(String(20), server_default=text("'static_pix'"), default="static_pix")
    pix_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mp_access_token: Mapped[str | None] = mapped_column(String(500), nullable=True)
    mp_webhook_secret: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Theme
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    primary_color: Mapped[str] = mapped_column(String(7), server_default=text("'#d4a937'"), default="#d4a937")
    accent_color: Mapped[str] = mapped_column(String(7), server_default=text("'#1a5c38'"), default="#1a5c38")
    bg_color: Mapped[str] = mapped_column(String(7), server_default=text("'#0f1419'"), default="#0f1419")
    text_color: Mapped[str] = mapped_column(String(7), server_default=text("'#e5e7eb'"), default="#e5e7eb")
    bg_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    font_family: Mapped[str] = mapped_column(String(100), server_default=text("'Inter'"), default="Inter")
    tv_layout: Mapped[str] = mapped_column(String(20), server_default=text("'classic'"), default="classic")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner: Mapped["ClubOwner | None"] = relationship(back_populates="clubs")
    sessions: Mapped[list["Session"]] = relationship(back_populates="club")
    players: Mapped[list["Player"]] = relationship(back_populates="club")
    chip_denominations: Mapped[list["ChipDenomination"]] = relationship(
        back_populates="club", cascade="all, delete-orphan"
    )


class ChipDenomination(Base):
    __tablename__ = "chip_denominations"
    __table_args__ = (
        UniqueConstraint("club_id", "value", name="uq_club_chip_value"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(50), nullable=False)
    value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    club: Mapped["Club"] = relationship(back_populates="chip_denominations")


class Player(Base):
    __tablename__ = "players"
    __table_args__ = (
        UniqueConstraint("club_id", "phone", name="uq_player_club_phone"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    club: Mapped["Club"] = relationship(back_populates="players")
    session_players: Mapped[list["SessionPlayer"]] = relationship(back_populates="player")


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index(
            "uq_sessions_club_open",
            "club_id",
            unique=True,
            postgresql_where="status = 'open'",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    blinds_info: Mapped[str] = mapped_column(String(100), nullable=False)
    buy_in_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    rebuy_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    allow_rebuys: Mapped[bool] = mapped_column(Boolean, default=True)
    rake_buyin: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    rake_rebuy: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="open")
    table_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cash_king_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    buyin_kit: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    rebuy_kit: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    club: Mapped["Club"] = relationship(back_populates="sessions")
    session_players: Mapped[list["SessionPlayer"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class SessionPlayer(Base):
    __tablename__ = "session_players"
    __table_args__ = (
        UniqueConstraint("session_id", "player_id", name="uq_session_player"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    token: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, default=new_uuid, index=True)
    status: Mapped[str] = mapped_column(String(20), default="waiting_payment")
    total_chips_in: Mapped[int] = mapped_column(Integer, default=0)
    total_physical_chips: Mapped[int] = mapped_column(Integer, default=0)
    total_chips_out: Mapped[int] = mapped_column(Integer, default=0)
    croupier_hours: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    pix_key: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payout_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    payout_status: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pending, paid
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    session: Mapped["Session"] = relationship(back_populates="session_players")
    player: Mapped["Player"] = relationship(back_populates="session_players")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="session_player", cascade="all, delete-orphan"
    )


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    session_player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("session_players.id"), nullable=False
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # buy_in, rebuy, cash_out
    amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    chip_count: Mapped[int] = mapped_column(Integer, nullable=False) # Valor monetário
    physical_chip_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0) # Qtd de peças
    rake_amount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pix, cash, null for cash_out
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    session_player: Mapped["SessionPlayer"] = relationship(back_populates="transactions")
    payment_pix: Mapped["PaymentPix | None"] = relationship(
        back_populates="transaction", uselist=False, cascade="all, delete-orphan"
    )


class PaymentPix(Base):
    __tablename__ = "payments_pix"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id"), unique=True, nullable=False
    )
    mp_payment_id: Mapped[str] = mapped_column(String(50), index=True, nullable=False)
    qr_code_base64: Mapped[str] = mapped_column(Text, nullable=False)
    qr_code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    transaction: Mapped["Transaction"] = relationship(back_populates="payment_pix")


class CashKingScore(Base):
    __tablename__ = "cash_king_scores"
    __table_args__ = (
        Index(
            "uq_cashking_session_player",
            "session_player_id",
            unique=True,
            postgresql_where=text("session_player_id IS NOT NULL"),
        ),
        Index("ix_cashking_club_month", "club_id", "year_month"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    club_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("players.id", ondelete="RESTRICT"), nullable=False
    )
    session_player_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("session_players.id", ondelete="CASCADE"), nullable=True
    )
    year_month: Mapped[str] = mapped_column(String(7), nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)

    attendance_pts: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    hours_pts: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    croupier_pts: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    profit_pts: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    manual_adj: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    total_pts: Mapped[float] = mapped_column(Numeric(8, 2), default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    club: Mapped["Club"] = relationship()
    player: Mapped["Player"] = relationship()
    session_player: Mapped["SessionPlayer | None"] = relationship()
