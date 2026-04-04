# PokerClub Manager

Web application for managing poker cash game sessions with integrated Pix payments via Mercado Pago.

## Stack

- **Backend:** FastAPI + SQLAlchemy 2.0 + PostgreSQL 15 + Alembic
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + TanStack Query
- **Payments:** Mercado Pago Pix (Python SDK)
- **Real-time:** WebSocket (native FastAPI)
- **Infra:** Docker Compose + Nginx

## Quick Start (Development)

### 1. Start the database

```bash
cp .env.example .env
docker compose up db -d
```

### 2. Start the API

```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server runs on `http://localhost:5173` and proxies `/api/*` to `localhost:8000`.

## Production

```bash
docker compose --profile production up -d
```

This starts PostgreSQL, the API (with auto-migration), and Nginx (serving the React build and proxying API/WebSocket requests).

## Environment Variables

See `.env.example` for all required variables. Key ones:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL async connection string |
| `MP_ACCESS_TOKEN` | Mercado Pago access token |
| `MP_WEBHOOK_SECRET` | Webhook signature validation secret |
| `ADMIN_USER` / `ADMIN_PASS` | Admin panel credentials |
| `JWT_SECRET` | Secret for signing admin JWT tokens |
| `BASE_URL` | Public URL for QR code generation |

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, routers, WebSocket
│   │   ├── config.py            # Settings from env vars
│   │   ├── database.py          # Async SQLAlchemy engine + session
│   │   ├── models.py            # ORM models (5 tables)
│   │   ├── schemas.py           # Pydantic request/response schemas
│   │   ├── auth.py              # JWT creation + validation
│   │   ├── routers/
│   │   │   ├── sessions.py      # Session CRUD + player join
│   │   │   ├── players.py       # Buy-in + rebuy endpoints
│   │   │   ├── admin.py         # Admin auth, cash, verify, cashout, close
│   │   │   └── webhooks.py      # Mercado Pago webhook handler
│   │   └── services/
│   │       ├── payment_service.py    # MP SDK wrapper
│   │       └── websocket_manager.py  # WS connection manager
│   ├── alembic/                 # Database migrations
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/               # TV Lobby, Player Join/Session, Admin
│       ├── hooks/               # useWebSocket, useSession
│       ├── api/client.ts        # API client
│       ├── strings.ts           # pt-BR string constants
│       └── App.tsx              # Router setup
├── nginx/nginx.conf
├── docker-compose.yml
└── .env.example
```
