import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { useSession } from "@/hooks/useSession";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useClubTheme } from "@/hooks/useClubTheme";
import { pt } from "@/strings";
import type { SessionPlayerData } from "@/api/client";

const PLAYERS_PER_PAGE = 10;
const PAGE_ROTATE_MS = 8000;

type LayoutProps = {
  players: SessionPlayerData[];
  visiblePlayers: SessionPlayerData[];
  joinUrl: string;
  totalPages: number;
  currentPage: number;
  primary: string;
  accent: string;
  text: string;
};

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

export default function TVLobby() {
  const { clubId, sessionId } = useParams<{ clubId: string; sessionId: string }>();
  const { data, refetch } = useSession(clubId, sessionId);
  const theme = useClubTheme(clubId);
  const [currentPage, setCurrentPage] = useState(0);

  // Wake Lock
  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request("screen");
      } catch {
        // Wake Lock not supported
      }
    };
    requestWakeLock();
    return () => {
      wakeLock?.release();
    };
  }, []);

  const { connected } = useWebSocket({
    sessionId,
    onEvent: useCallback(() => {
      refetch();
    }, [refetch]),
  });

  const players = data?.session_players ?? [];
  const totalPages = Math.max(1, Math.ceil(players.length / PLAYERS_PER_PAGE));

  useEffect(() => {
    if (totalPages <= 1) return;
    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, PAGE_ROTATE_MS);
    return () => clearInterval(interval);
  }, [totalPages]);

  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(0);
  }, [currentPage, totalPages]);

  const visiblePlayers = players.slice(
    currentPage * PLAYERS_PER_PAGE,
    (currentPage + 1) * PLAYERS_PER_PAGE,
  );

  const joinUrl = `${window.location.origin}/join/${clubId}/${sessionId}`;
  const now = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const layoutProps: LayoutProps = {
    players,
    visiblePlayers,
    joinUrl,
    totalPages,
    currentPage,
    primary: theme.primary_color,
    accent: theme.accent_color,
    text: theme.text_color,
  };

  const containerStyle: React.CSSProperties = {
    backgroundColor: theme.bg_color,
    color: theme.text_color,
    fontFamily: theme.font_family,
    backgroundImage: theme.bg_image_url ? `url(${theme.bg_image_url})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };

  return (
    <div className="min-h-screen flex flex-col" style={containerStyle}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-8 py-4 border-b"
        style={{ borderColor: `${theme.text_color}22` }}
      >
        <div className="flex items-center gap-4">
          {theme.logo_url && (
            <img src={theme.logo_url} alt="logo" className="h-14 object-contain" />
          )}
          <div>
            <h1 className="text-3xl font-bold" style={{ color: theme.primary_color }}>
              {data?.name ?? "PokerClub"}
            </h1>
            <p className="text-lg opacity-70">
              {data?.blinds_info && `Blind ${pt.currency(parseFloat(data.blinds_info) || 0)}`} &middot; {now}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-4xl font-bold">{players.length}</p>
          <p className="opacity-70">{pt.tv.players}</p>
          {!connected && (
            <p className="text-orange-400 text-sm">{pt.tv.reconnecting}</p>
          )}
        </div>
      </div>

      {/* Layout-specific body */}
      {theme.tv_layout === "cards" ? (
        <CardsLayout {...layoutProps} />
      ) : theme.tv_layout === "minimal" ? (
        <MinimalLayout {...layoutProps} />
      ) : (
        <ClassicLayout {...layoutProps} />
      )}
    </div>
  );
}

function ClassicLayout({
  players,
  visiblePlayers,
  joinUrl,
  totalPages,
  currentPage,
  primary,
  text,
}: LayoutProps) {
  return (
    <div className="flex-1 flex">
      <div
        className="w-2/5 flex flex-col items-center justify-center border-r p-8"
        style={{ borderColor: `${text}22` }}
      >
        <div className="bg-white p-4 rounded-2xl">
          <QRCode value={joinUrl} size={320} />
        </div>
        <p className="text-xl mt-6 opacity-70">{pt.tv.scanToJoin}</p>
      </div>
      <div className="w-3/5 p-8 flex flex-col">
        {players.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-2xl opacity-50">{pt.tv.noPlayers}</p>
          </div>
        ) : (
          <>
            <div className="flex-1">
              <table className="w-full">
                <thead>
                  <tr className="text-lg border-b opacity-70" style={{ borderColor: `${text}22` }}>
                    <th className="text-left py-3 px-4">Nome</th>
                    <th className="text-center py-3 px-4">Status</th>
                    <th className="text-right py-3 px-4">Buy-in</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlayers.map((sp) => (
                    <tr
                      key={sp.id}
                      className="border-b transition-all duration-500"
                      style={{ borderColor: `${text}11` }}
                    >
                      <td className="py-4 px-4 text-2xl font-medium">{sp.player.name}</td>
                      <td className="py-4 px-4 text-center">
                        <span className="inline-flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${statusDot(sp.status)}`} />
                          <span className="text-lg opacity-80">
                            {pt.status[sp.status as keyof typeof pt.status] ?? sp.status}
                          </span>
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-2xl">
                        {sp.total_chips_in > 0 ? pt.currency(sp.total_chips_in) : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {Array.from({ length: totalPages }, (_, i) => (
                  <span
                    key={i}
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: i === currentPage ? primary : `${text}33` }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CardsLayout({ players, visiblePlayers, joinUrl, accent, text, primary }: LayoutProps) {
  return (
    <div className="flex-1 flex flex-col p-8">
      <div className="flex items-start gap-8 mb-6">
        <div className="bg-white p-3 rounded-xl shrink-0">
          <QRCode value={joinUrl} size={180} />
        </div>
        <div className="flex-1 self-center">
          <p className="text-3xl font-bold mb-2" style={{ color: primary }}>
            {pt.tv.scanToJoin}
          </p>
          <p className="text-lg opacity-70">
            {players.length} {pt.tv.players}
          </p>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-2xl opacity-50">{pt.tv.noPlayers}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          {visiblePlayers.map((sp) => (
            <div
              key={sp.id}
              className="rounded-xl p-4 border flex items-center justify-between"
              style={{
                backgroundColor: `${accent}22`,
                borderColor: `${text}22`,
              }}
            >
              <div>
                <p className="text-2xl font-bold">{sp.player.name}</p>
                <span className="inline-flex items-center gap-2 mt-1">
                  <span className={`w-2.5 h-2.5 rounded-full ${statusDot(sp.status)}`} />
                  <span className="text-sm opacity-70">
                    {pt.status[sp.status as keyof typeof pt.status] ?? sp.status}
                  </span>
                </span>
              </div>
              <p className="text-xl font-semibold" style={{ color: primary }}>
                {sp.total_chips_in > 0 ? pt.currency(sp.total_chips_in) : "\u2014"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MinimalLayout({ players, visiblePlayers, joinUrl, primary, text }: LayoutProps) {
  return (
    <div className="flex-1 flex flex-col p-8 relative">
      <div className="absolute top-4 right-8 bg-white p-2 rounded-lg">
        <QRCode value={joinUrl} size={120} />
      </div>

      {players.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-3xl opacity-50">{pt.tv.noPlayers}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-center">
          {visiblePlayers.map((sp) => (
            <div
              key={sp.id}
              className="flex items-center justify-between py-3 border-b"
              style={{ borderColor: `${text}11` }}
            >
              <div className="flex items-center gap-4">
                <span className={`w-4 h-4 rounded-full ${statusDot(sp.status)}`} />
                <span className="text-4xl font-bold">{sp.player.name}</span>
              </div>
              <span className="text-3xl" style={{ color: primary }}>
                {sp.total_chips_in > 0 ? pt.currency(sp.total_chips_in) : "\u2014"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
