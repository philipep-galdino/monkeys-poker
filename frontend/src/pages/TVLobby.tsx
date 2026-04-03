import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { useSession } from "@/hooks/useSession";
import { useWebSocket } from "@/hooks/useWebSocket";
import { pt } from "@/strings";

const PLAYERS_PER_PAGE = 10;
const PAGE_ROTATE_MS = 8000;

export default function TVLobby() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, refetch } = useSession(sessionId);
  const [currentPage, setCurrentPage] = useState(0);

  // Request Wake Lock to prevent screen sleep
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        // Wake Lock not supported or denied
      }
    };
    requestWakeLock();
    return () => {
      wakeLock?.release();
    };
  }, []);

  // WebSocket for real-time updates
  const { connected } = useWebSocket({
    sessionId,
    onEvent: useCallback(() => {
      refetch();
    }, [refetch]),
  });

  const players = data?.session_players ?? [];
  const totalPages = Math.max(1, Math.ceil(players.length / PLAYERS_PER_PAGE));

  // Auto-rotate pages
  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_ROTATE_MS);
    return () => clearInterval(interval);
  }, [totalPages]);

  // Reset to page 0 if pages shrink
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(0);
  }, [currentPage, totalPages]);

  const visiblePlayers = players.slice(
    currentPage * PLAYERS_PER_PAGE,
    (currentPage + 1) * PLAYERS_PER_PAGE,
  );

  const joinUrl = `${window.location.origin}/join/${sessionId}`;
  const now = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const statusDot = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-400";
      case "waiting_payment":
        return "bg-yellow-400";
      case "cashed_out":
        return "bg-gray-400";
      default:
        return "bg-gray-400";
    }
  };

  return (
    <div className="min-h-screen bg-poker-dark text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-gray-700">
        <div>
          <h1 className="text-3xl font-bold text-poker-gold">
            {data?.name ?? "PokerClub"}
          </h1>
          <p className="text-gray-400 text-lg">
            {data?.blinds_info && `Blinds ${data.blinds_info}`} &middot; {now}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold">{players.length}</p>
          <p className="text-gray-400">{pt.tv.players}</p>
          {!connected && (
            <p className="text-orange-400 text-sm">{pt.tv.reconnecting}</p>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* QR Code section — left 40% */}
        <div className="w-2/5 flex flex-col items-center justify-center border-r border-gray-700 p-8">
          <div className="bg-white p-4 rounded-2xl">
            <QRCode value={joinUrl} size={320} />
          </div>
          <p className="text-gray-400 text-xl mt-6">{pt.tv.scanToJoin}</p>
        </div>

        {/* Player list — right 60% */}
        <div className="w-3/5 p-8 flex flex-col">
          {players.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-gray-500 text-2xl">{pt.tv.noPlayers}</p>
            </div>
          ) : (
            <>
              <div className="flex-1">
                <table className="w-full">
                  <thead>
                    <tr className="text-gray-400 text-lg border-b border-gray-700">
                      <th className="text-left py-3 px-4">Nome</th>
                      <th className="text-center py-3 px-4">Status</th>
                      <th className="text-right py-3 px-4">Fichas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiblePlayers.map((sp) => (
                      <tr
                        key={sp.id}
                        className="border-b border-gray-800 transition-all duration-500"
                      >
                        <td className="py-4 px-4 text-2xl font-medium">
                          {sp.player.name}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className={`w-3 h-3 rounded-full ${statusDot(sp.status)}`}
                            />
                            <span className="text-lg text-gray-300">
                              {pt.status[sp.status as keyof typeof pt.status] ??
                                sp.status}
                            </span>
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right text-2xl">
                          {sp.total_chips_in > 0 ? sp.total_chips_in : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Page indicator */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4">
                  {Array.from({ length: totalPages }, (_, i) => (
                    <span
                      key={i}
                      className={`w-3 h-3 rounded-full ${
                        i === currentPage ? "bg-poker-gold" : "bg-gray-600"
                      }`}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
