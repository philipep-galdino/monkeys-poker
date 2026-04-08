"""
Seed the database with comprehensive sample data for development/testing.

Usage:
    cd backend && python seed.py

Creates:
    - 1 club with chip denominations and rake config
    - 3 sessions: 1 open, 2 closed (with full transaction history)
    - 8 players across sessions with varied statuses
    - Buy-in, rebuy, cashout transactions with rake and physical chip tracking
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.database import async_session
from app.models import (
    ChipDenomination,
    Club,
    Player,
    Session,
    SessionPlayer,
    Transaction,
)
from app.services.chip_service import calculate_buyin_kit, calculate_rebuy_kit


def utcnow():
    return datetime.now(timezone.utc)


async def seed():
    async with async_session() as db:
        result = await db.execute(text("SELECT count(*) FROM clubs"))
        if result.scalar_one() > 0:
            print("Database already has data. Skipping seed.")
            print("To re-seed, truncate all tables first.")
            return

        # ── Club ────────────────────────────────────────────────────────────
        club = Club(
            name="PokerClub Demo",
            slug="demo",
            description="Clube de demonstração para testes",
            default_rake_buyin=10.00,
            default_rake_rebuy=5.00,
            allow_multiple_buyins=True,
        )
        db.add(club)
        await db.flush()
        print(f"Club: {club.name} (id={club.id})")

        # ── Chip Denominations ──────────────────────────────────────────────
        chips_data = [
            ("R$1", 1.00, 200, "#FFFFFF", 0),
            ("R$2", 2.00, 200, "#FF4444", 1),
            ("R$5", 5.00, 200, "#2196F3", 2),
            ("R$10", 10.00, 100, "#4CAF50", 3),
            ("R$25", 25.00, 80, "#000000", 4),
            ("R$100", 100.00, 40, "#9C27B0", 5),
        ]
        denoms = []
        for label, value, qty, color, order in chips_data:
            d = ChipDenomination(
                club_id=club.id,
                label=label,
                value=value,
                quantity=qty,
                color=color,
                active=True,
                sort_order=order,
            )
            db.add(d)
            denoms.append(d)
        await db.flush()
        print(f"  {len(denoms)} chip denominations configured")

        # ── Players ─────────────────────────────────────────────────────────
        players_data = [
            ("Lucas Silva", "11999880001"),
            ("Pedro Santos", "11999880002"),
            ("Ana Costa", "11999880003"),
            ("Marcos Oliveira", "11999880004"),
            ("Julia Mendes", "11999880005"),
            ("Rafael Lima", "11999880006"),
            ("Camila Torres", "11999880007"),
            ("Bruno Almeida", "11999880008"),
        ]
        players = {}
        for name, phone in players_data:
            p = Player(club_id=club.id, name=name, phone=phone)
            db.add(p)
            await db.flush()
            players[phone] = p

        print(f"  {len(players)} players created")

        # Calculate kits for sessions
        buyin_kit, remaining_inv = calculate_buyin_kit(denoms, 100.0, "2", 9)
        rebuy_kit = calculate_rebuy_kit(denoms, 100.0, 9, remaining_inv)
        buyin_physical = buyin_kit.get("total_chips_count", 0)
        rebuy_physical = rebuy_kit.get("total_chips_count", 0)

        # ── Session 1 (closed, 5 days ago) ──────────────────────────────────
        s1_created = utcnow() - timedelta(days=5)
        s1_closed = s1_created + timedelta(hours=6)
        s1 = Session(
            club_id=club.id,
            name="Cash Game - Terça",
            blinds_info="2",
            buy_in_amount=100.00,
            rebuy_amount=100.00,
            allow_rebuys=True,
            rake_buyin=10.00,
            rake_rebuy=5.00,
            table_limit=9,
            buyin_kit=buyin_kit,
            rebuy_kit=rebuy_kit,
            status="closed",
            created_at=s1_created,
            closed_at=s1_closed,
        )
        db.add(s1)
        await db.flush()

        # Players in session 1: Lucas, Pedro, Ana, Marcos (all cashed out)
        s1_players = [
            # (player, buyins, rebuys, cashout_chips)
            (players["11999880001"], 1, 2, 350),   # Lucas: won big
            (players["11999880002"], 1, 1, 120),   # Pedro: small loss
            (players["11999880003"], 1, 0, 60),    # Ana: loss
            (players["11999880004"], 1, 1, 180),   # Marcos: even
        ]
        for player, buyins, rebuys, cashout in s1_players:
            sp = SessionPlayer(
                session_id=s1.id,
                player_id=player.id,
                status="cashed_out",
                joined_at=s1_created + timedelta(minutes=10),
            )
            db.add(sp)
            await db.flush()

            total_chips = 0
            total_physical = 0

            # Buy-in
            buyin_chips = int(100 - 10)  # amount - rake
            tx = Transaction(
                session_player_id=sp.id,
                type="buy_in",
                amount=100.00,
                chip_count=buyin_chips,
                physical_chip_count=buyin_physical,
                rake_amount=10.00,
                payment_method="cash",
                status="confirmed",
                created_at=s1_created + timedelta(minutes=15),
            )
            db.add(tx)
            total_chips += buyin_chips
            total_physical += buyin_physical

            # Rebuys
            for r in range(rebuys):
                rebuy_chips = int(100 - 5)  # amount - rake
                tx = Transaction(
                    session_player_id=sp.id,
                    type="rebuy",
                    amount=100.00,
                    chip_count=rebuy_chips,
                    physical_chip_count=rebuy_physical,
                    rake_amount=5.00,
                    payment_method="cash",
                    status="confirmed",
                    created_at=s1_created + timedelta(hours=1 + r),
                )
                db.add(tx)
                total_chips += rebuy_chips
                total_physical += rebuy_physical

            # Cashout
            tx = Transaction(
                session_player_id=sp.id,
                type="cash_out",
                amount=0,
                chip_count=cashout,
                physical_chip_count=0,
                rake_amount=0,
                payment_method=None,
                status="confirmed",
                created_at=s1_closed - timedelta(minutes=10),
            )
            db.add(tx)

            sp.total_chips_in = total_chips
            sp.total_physical_chips = total_physical
            sp.total_chips_out = cashout
            await db.flush()

        print(f"  Session 1 (closed): {s1.name} — 4 players")

        # ── Session 2 (closed, 2 days ago) ──────────────────────────────────
        s2_created = utcnow() - timedelta(days=2)
        s2_closed = s2_created + timedelta(hours=5)
        s2 = Session(
            club_id=club.id,
            name="Cash Game - Quinta",
            blinds_info="5",
            buy_in_amount=200.00,
            rebuy_amount=200.00,
            allow_rebuys=True,
            rake_buyin=10.00,
            rake_rebuy=5.00,
            table_limit=6,
            buyin_kit=buyin_kit,
            rebuy_kit=rebuy_kit,
            status="closed",
            created_at=s2_created,
            closed_at=s2_closed,
        )
        db.add(s2)
        await db.flush()

        s2_players = [
            (players["11999880001"], 1, 0, 250),   # Lucas: profit
            (players["11999880003"], 1, 1, 300),   # Ana: big win (recovering)
            (players["11999880005"], 1, 0, 150),   # Julia: small loss
            (players["11999880006"], 1, 2, 100),   # Rafael: big loss
        ]
        for player, buyins, rebuys, cashout in s2_players:
            sp = SessionPlayer(
                session_id=s2.id,
                player_id=player.id,
                status="cashed_out",
                joined_at=s2_created + timedelta(minutes=5),
            )
            db.add(sp)
            await db.flush()

            total_chips = 0
            total_physical = 0
            buyin_chips = int(200 - 10)
            tx = Transaction(
                session_player_id=sp.id,
                type="buy_in",
                amount=200.00,
                chip_count=buyin_chips,
                physical_chip_count=buyin_physical,
                rake_amount=10.00,
                payment_method="pix" if player.phone.endswith("5") else "cash",
                status="confirmed",
                created_at=s2_created + timedelta(minutes=10),
            )
            db.add(tx)
            total_chips += buyin_chips
            total_physical += buyin_physical

            for r in range(rebuys):
                rebuy_chips = int(200 - 5)
                tx = Transaction(
                    session_player_id=sp.id,
                    type="rebuy",
                    amount=200.00,
                    chip_count=rebuy_chips,
                    physical_chip_count=rebuy_physical,
                    rake_amount=5.00,
                    payment_method="cash",
                    status="confirmed",
                    created_at=s2_created + timedelta(hours=1 + r),
                )
                db.add(tx)
                total_chips += rebuy_chips
                total_physical += rebuy_physical

            tx = Transaction(
                session_player_id=sp.id,
                type="cash_out",
                amount=0,
                chip_count=cashout,
                physical_chip_count=0,
                rake_amount=0,
                payment_method=None,
                status="confirmed",
                created_at=s2_closed - timedelta(minutes=5),
            )
            db.add(tx)

            sp.total_chips_in = total_chips
            sp.total_physical_chips = total_physical
            sp.total_chips_out = cashout
            await db.flush()

        print(f"  Session 2 (closed): {s2.name} — 4 players")

        # ── Session 3 (open, current) ───────────────────────────────────────
        s3 = Session(
            club_id=club.id,
            name="Cash Game - Sábado",
            blinds_info="2",
            buy_in_amount=100.00,
            rebuy_amount=100.00,
            allow_rebuys=True,
            rake_buyin=10.00,
            rake_rebuy=5.00,
            table_limit=9,
            buyin_kit=buyin_kit,
            rebuy_kit=rebuy_kit,
            status="open",
        )
        db.add(s3)
        await db.flush()

        buyin_chips = int(100 - 10)
        rebuy_chips_val = int(100 - 5)

        # Lucas: active with 1 buy-in + 1 rebuy
        sp_lucas = SessionPlayer(
            session_id=s3.id,
            player_id=players["11999880001"].id,
            status="active",
        )
        db.add(sp_lucas)
        await db.flush()
        for tx_type, chips, physical, rake in [
            ("buy_in", buyin_chips, buyin_physical, 10.0),
            ("rebuy", rebuy_chips_val, rebuy_physical, 5.0),
        ]:
            tx = Transaction(
                session_player_id=sp_lucas.id,
                type=tx_type,
                amount=100.00,
                chip_count=chips,
                physical_chip_count=physical,
                rake_amount=rake,
                payment_method="cash",
                status="confirmed",
            )
            db.add(tx)
        sp_lucas.total_chips_in = buyin_chips + rebuy_chips_val
        sp_lucas.total_physical_chips = buyin_physical + rebuy_physical

        # Pedro: active with 1 buy-in
        sp_pedro = SessionPlayer(
            session_id=s3.id,
            player_id=players["11999880002"].id,
            status="active",
        )
        db.add(sp_pedro)
        await db.flush()
        tx = Transaction(
            session_player_id=sp_pedro.id,
            type="buy_in",
            amount=100.00,
            chip_count=buyin_chips,
            physical_chip_count=buyin_physical,
            rake_amount=10.00,
            payment_method="cash",
            status="confirmed",
        )
        db.add(tx)
        sp_pedro.total_chips_in = buyin_chips
        sp_pedro.total_physical_chips = buyin_physical

        # Julia: waiting_payment (just joined, no buy-in yet)
        sp_julia = SessionPlayer(
            session_id=s3.id,
            player_id=players["11999880005"].id,
            status="waiting_payment",
        )
        db.add(sp_julia)

        # Camila: active with 1 buy-in
        sp_camila = SessionPlayer(
            session_id=s3.id,
            player_id=players["11999880007"].id,
            status="active",
        )
        db.add(sp_camila)
        await db.flush()
        tx = Transaction(
            session_player_id=sp_camila.id,
            type="buy_in",
            amount=100.00,
            chip_count=buyin_chips,
            physical_chip_count=buyin_physical,
            rake_amount=10.00,
            payment_method="pix",
            status="confirmed",
        )
        db.add(tx)
        sp_camila.total_chips_in = buyin_chips
        sp_camila.total_physical_chips = buyin_physical

        # Bruno: active with 1 buy-in
        sp_bruno = SessionPlayer(
            session_id=s3.id,
            player_id=players["11999880008"].id,
            status="active",
        )
        db.add(sp_bruno)
        await db.flush()
        tx = Transaction(
            session_player_id=sp_bruno.id,
            type="buy_in",
            amount=100.00,
            chip_count=buyin_chips,
            physical_chip_count=buyin_physical,
            rake_amount=10.00,
            payment_method="cash",
            status="confirmed",
        )
        db.add(tx)
        sp_bruno.total_chips_in = buyin_chips
        sp_bruno.total_physical_chips = buyin_physical

        await db.flush()
        await db.commit()

        print(f"  Session 3 (open):   {s3.name} — 5 players (4 active, 1 waiting)")
        print()
        print("=" * 60)
        print("Seed complete!")
        print()
        print(f"  Admin login:     admin / changeme123")
        print(f"  Admin panel:     http://localhost:5173/admin")
        print(f"  Club dashboard:  http://localhost:5173/admin/clubs/{club.id}")
        print(f"  Club settings:   http://localhost:5173/admin/clubs/{club.id}/settings")
        print(f"  Session history: http://localhost:5173/admin/clubs/{club.id}/history")
        print(f"  TV Lobby:        http://localhost:5173/tv/{club.id}/{s3.id}")
        print(f"  Player join:     http://localhost:5173/join/{club.id}/{s3.id}")
        print("=" * 60)


if __name__ == "__main__":
    asyncio.run(seed())
