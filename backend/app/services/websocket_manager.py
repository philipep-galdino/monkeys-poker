import json
import uuid
from datetime import datetime, timezone

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections grouped by session ID.

    Provides broadcast capability so any state-changing endpoint
    can push real-time updates to all clients watching a session.
    """

    def __init__(self) -> None:
        self._connections: dict[uuid.UUID, list[WebSocket]] = {}

    async def connect(self, session_id: uuid.UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(session_id, []).append(websocket)

    def disconnect(self, session_id: uuid.UUID, websocket: WebSocket) -> None:
        conns = self._connections.get(session_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns:
            self._connections.pop(session_id, None)

    async def broadcast(self, session_id: uuid.UUID, event: str, data: dict) -> None:
        """Send an event to all connected clients for a given session."""
        message = json.dumps({
            "event": event,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        conns = self._connections.get(session_id, [])
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(session_id, ws)

    def get_connection_count(self, session_id: uuid.UUID) -> int:
        return len(self._connections.get(session_id, []))


manager = ConnectionManager()
