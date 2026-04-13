import uuid
import traceback
import os
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import async_session
from app.routers import admin, cash_king, chips, clubs, owners, players, sessions, webhooks
from app.schemas import HealthResponse
from app.services.websocket_manager import manager

app = FastAPI(title="PokerClub Manager", version="1.0.0")

# Middleware para Log de Erros em Arquivo
@app.middleware("http")
async def error_logging_middleware(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception as e:
        # Pega o diretório do projeto (backend/app_errors.log)
        log_path = os.path.join(os.getcwd(), "app_errors.log")
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"\n{'='*50}\n")
            f.write(f"ERRO: {datetime.now()}\n")
            f.write(f"Rota: {request.url.path}\n")
            f.write(traceback.format_exc())
            f.write(f"{'='*50}\n")
        
        return JSONResponse(
            status_code=500,
            content={"detail": "Erro interno no servidor. Verifique os logs em backend/app_errors.log"}
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=r"https://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(clubs.router, prefix="/api")
app.include_router(chips.router, prefix="/api")
app.include_router(sessions.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")
app.include_router(cash_king.router, prefix="/api")
app.include_router(owners.router, prefix="/api")


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
