import uuid

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import async_session
from app.routers import admin, players, sessions, webhooks
from app.schemas import HealthResponse
from app.services.websocket_manager import manager

app = FastAPI(title="PokerClub Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")


@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint — verifies database connectivity."""
    try:
        async with async_session() as db:
            await db.execute(text("SELECT 1"))
        return HealthResponse(status="ok", database="connected")
    except Exception:
        return HealthResponse(status="degraded", database="disconnected")


@app.websocket("/api/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: uuid.UUID):
    await manager.connect(session_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(session_id, websocket)
