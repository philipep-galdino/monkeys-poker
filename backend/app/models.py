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
    event,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


class Base(DeclarativeBase):
    pass


class Player(Base):
    __tablename__ = "players"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    session_players: Mapped[list["SessionPlayer"]] = relationship(back_populates="player")


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        Index("uq_sessions_open", "status", unique=True, postgresql_where="status = 'open'"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    blinds_info: Mapped[str] = mapped_column(String(100), nullable=False)
    buy_in_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    rebuy_amount: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    allow_rebuys: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

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
    total_chips_out: Mapped[int] = mapped_column(Integer, default=0)
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
    chip_count: Mapped[int] = mapped_column(Integer, nullable=False)
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
