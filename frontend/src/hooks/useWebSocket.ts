import { useCallback, useEffect, useRef, useState } from "react";

export type WSEvent = {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
};

type UseWebSocketOptions = {
  sessionId: string | undefined;
  onEvent?: (event: WSEvent) => void;
};

const MAX_BACKOFF = 30_000;

export function useWebSocket({ sessionId, onEvent }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!sessionId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/ws/${sessionId}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WS] Conectado ao servidor:", url);
      setConnected(true);
      retriesRef.current = 0;
    };

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data);
        setLastEvent(event);
        onEventRef.current?.(event);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      console.log(`[WS] Conexão encerrada (${event.code}):`, event.reason || "Sem motivo especificado");
      setConnected(false);
      wsRef.current = null;

      // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
      const delay = Math.min(1000 * 2 ** retriesRef.current, MAX_BACKOFF);
      retriesRef.current += 1;
      setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.error("[WS] Erro na conexão:", error);
      ws.close();
    };

    wsRef.current = ws;
  }, [sessionId]);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { connected, lastEvent };
}
