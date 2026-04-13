import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { api, ApiError, CashKingLeaderboardEntry, CashKingScoreData } from "@/api/client";
import { usePlayerSession } from "@/hooks/useSession";
import { useWebSocket, WSEvent } from "@/hooks/useWebSocket";
import { useClubTheme } from "@/hooks/useClubTheme";
import PoweredBy from "@/components/PoweredBy";
import { pt } from "@/strings";

type PixData = {
  transaction_id: string;
  payment_mode: string;
  amount: number;
  // MP mode
  qr_code?: string;
  qr_code_base64?: string;
  expires_at?: string;
  // Static pix mode
  pix_key?: string;
};

type Tab = "session" | "cashking" | "history";

type HistoryData = {
  items: {
    session_id: string;
    session_name: string;
    session_date: string;
    total_buyin: number;
    total_cashout: number;
    net_result: number;
    rebuy_count: number;
  }[];
  total_sessions: number;
  total_net: number;
};

/* ── Icons ──────────────────────────────────────────────────── */

const Crown = ({ size = 20, className = "", style }: { size?: number; className?: string; style?: React.CSSProperties }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} style={style}>
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
  </svg>
);

const ChevronDown = ({ size = 16, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
    <path d="M6 9l6 6 6-6" strokeLinecap="round" />
  </svg>
);

/* ── Main Component ─────────────────────────────────────────── */

export default function PlayerSession() {
  const { clubId, sessionId, token } = useParams<{
    clubId: string;
    sessionId: string;
    token: string;
  }>();

  const theme = useClubTheme(clubId);

  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("session");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownData, setBreakdownData] = useState<{
    items: { label: string; color: string | null; count: number }[];
    totalCount: number;
    totalValue: number;
  } | null>(null);

  // History state
  const [historyData, setHistoryData] = useState<HistoryData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Cash King state
  const [ckEntries, setCkEntries] = useState<CashKingLeaderboardEntry[]>([]);
  const [ckLoading, setCkLoading] = useState(false);
  const [ckLoaded, setCkLoaded] = useState(false);
  const [ckMonth, setCkMonth] = useState("");
  const [ckExpandedId, setCkExpandedId] = useState<string | null>(null);
  const [ckScores, setCkScores] = useState<CashKingScoreData[]>([]);
  const [ckScoresLoading, setCkScoresLoading] = useState(false);

  // Poll every 5s when showing a QR code (waiting for payment)
  const shouldPoll = !!pixData;
  const { data, isLoading, error, refetch } = usePlayerSession(
    clubId,
    sessionId,
    token,
    shouldPoll ? 5000 : undefined,
  );

  // WebSocket for real-time updates
  const { connected } = useWebSocket({
    sessionId,
    onEvent: useCallback(
      (event: WSEvent) => {
        if (event.event === "payment_confirmed" || event.event === "player_cashed_out") {
          refetch();
          if (event.event === "payment_confirmed") {
            setPixData(null);
          }
        }
        if (event.event === "session_closed") {
          setSessionClosed(true);
        }
      },
      [refetch],
    ),
  });

  // Clear QR when the pending transaction gets confirmed
  useEffect(() => {
    if (!pixData || !data) return;
    const tx = data.transactions.find((t) => t.id === pixData.transaction_id);
    if (tx && tx.status !== "pending") {
      setPixData(null);
    }
  }, [data, pixData]);

  // Lazy-load history when tab is selected
  useEffect(() => {
    if (activeTab !== "history" || historyLoaded || !clubId || !sessionId || !token) return;
    setHistoryLoading(true);
    api.getPlayerHistory(clubId, sessionId, token)
      .then((res) => {
        setHistoryData(res);
        setHistoryLoaded(true);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [activeTab, historyLoaded, clubId, sessionId, token]);

  // Lazy-load Cash King when tab is selected
  useEffect(() => {
    if (activeTab !== "cashking" || ckLoaded || !clubId) return;
    setCkLoading(true);
    api.getCashKingLeaderboard(clubId)
      .then((res) => {
        setCkEntries(res.entries);
        setCkMonth(res.year_month);
        setCkLoaded(true);
      })
      .catch(() => {})
      .finally(() => setCkLoading(false));
  }, [activeTab, ckLoaded, clubId]);

  const handleBuyin = async () => {
    if (!clubId || !sessionId || !token) return;
    setPixLoading(true);
    setPixError("");
    try {
      const result = await api.createBuyin(clubId, sessionId, token);
      setPixData(result);
    } catch (err) {
      setPixError(err instanceof ApiError ? err.detail : pt.player.paymentUnavailable);
    } finally {
      setPixLoading(false);
    }
  };

  const handleRebuy = async () => {
    if (!clubId || !sessionId || !token) return;
    setPixLoading(true);
    setPixError("");
    try {
      const result = await api.createRebuy(clubId, sessionId, token);
      setPixData(result);
    } catch (err) {
      setPixError(err instanceof ApiError ? err.detail : pt.player.paymentUnavailable);
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchBreakdown = async () => {
    if (!clubId || !data) return;
    setShowBreakdown(true);
    setLoadingBreakdown(true);
    try {
      const res = await api.getChipBreakdown(clubId, data.total_chips_in, "");
      setBreakdownData({ items: res.items, totalCount: res.total_chips_count, totalValue: res.total_value });
    } catch { /* ignore */ } finally { setLoadingBreakdown(false); }
  };

  const loadCkScores = async (playerId: string) => {
    if (!clubId) return;
    if (ckExpandedId === playerId) { setCkExpandedId(null); return; }
    setCkExpandedId(playerId);
    setCkScoresLoading(true);
    try {
      const res = await api.getCashKingPlayerScores(clubId, playerId, ckMonth);
      setCkScores(res);
    } catch { /* ignore */ } finally { setCkScoresLoading(false); }
  };

  const isExpired = pixData?.expires_at ? new Date(pixData.expires_at) < new Date() : false;
  const isStaticPix = pixData?.payment_mode === "static_pix";

  /* ── Loading / Error states ─────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.bg_color }}>
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: theme.primary_color, borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.bg_color }}>
        <div className="ck-card rounded-2xl p-8 text-center max-w-sm w-full border border-white/10">
          <p className="text-gray-400">{pt.player.invalidLink}</p>
        </div>
      </div>
    );
  }

  const statusConfig = {
    waiting_payment: { bg: "bg-yellow-500/15", text: "text-yellow-400", dot: "bg-yellow-400" },
    active: { bg: "bg-green-500/15", text: "text-green-400", dot: "bg-green-400" },
    cashed_out: { bg: "bg-gray-500/15", text: "text-gray-400", dot: "bg-gray-400" },
  }[data.status] ?? { bg: "bg-gray-500/15", text: "text-gray-400", dot: "bg-gray-400" };

  const confirmedRebuyTotal = data.transactions
    .filter((t) => t.type === "rebuy" && t.status === "confirmed")
    .reduce((acc, t) => acc + t.amount, 0);

  const buyinAmount = data.total_chips_in - confirmedRebuyTotal;

  // Available tabs
  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "session", label: pt.player.tabSession, show: true },
    { key: "cashking", label: pt.player.tabCashKing, show: data.cash_king_enabled },
    { key: "history", label: pt.player.tabHistory, show: true },
  ];

  // Find player position in Cash King
  const ckPlayerIdx = ckEntries.findIndex((e) => e.player.id === data.player_id);
  const ckPlayerEntry = ckPlayerIdx >= 0 ? ckEntries[ckPlayerIdx] : null;

  const medalColors: Record<number, string> = { 0: "text-yellow-400", 1: "text-gray-300", 2: "text-amber-600" };

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.bg_color, color: theme.text_color, fontFamily: theme.font_family }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div className="border-b border-white/5" style={{ background: `linear-gradient(to bottom, ${theme.bg_color}, color-mix(in srgb, ${theme.bg_color} 80%, #1a3a6e), ${theme.bg_color})` }}>
        <div className="max-w-md mx-auto px-4 pt-6 pb-4">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-gray-100">{data.player_name}</h1>
            <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`} />
              {pt.status[data.status as keyof typeof pt.status] ?? data.status}
            </span>
          </div>
          <p className="text-sm text-gray-500">{data.session_name}</p>
          {!connected && (
            <p className="text-xs text-orange-400 mt-1">{pt.tv.reconnecting}</p>
          )}
        </div>

        {/* ── Tabs ──────────────────────────────────────── */}
        <div className="max-w-md mx-auto px-4">
          <div className="flex gap-1">
            {tabs.filter(t => t.show).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 py-2.5 text-sm font-medium rounded-t-xl transition-all ${
                  activeTab === tab.key
                    ? "bg-white/[0.06] text-gray-100 border-b-2"
                    : "text-gray-500 hover:text-gray-400"
                }`}
                style={activeTab === tab.key ? { borderColor: theme.primary_color } : undefined}
              >
                {tab.key === "cashking" && <Crown size={14} className="inline mr-1 -mt-0.5" />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="max-w-md mx-auto px-4 py-5 space-y-4">

        {/* ── Session Closed Banner ─────────────────────── */}
        {sessionClosed && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center animate-fade-in-up">
            <p className="text-blue-400 font-medium">{pt.player.sessionClosed}</p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            SESSION TAB
            ══════════════════════════════════════════════════ */}
        {activeTab === "session" && (
          <>
            {/* Static Pix Display */}
            {pixData && isStaticPix && (
              <div className="ck-card rounded-2xl p-6 text-center animate-fade-in-up" style={{ border: `1px solid ${theme.primary_color}33` }}>
                <h2 className="text-lg font-semibold text-gray-200 mb-2">{pt.player.staticPixTitle}</h2>
                <p className="text-xs text-gray-500 mb-5">{pt.player.staticPixInstructions}</p>

                <div className="bg-white/[0.06] border border-white/10 rounded-xl p-4 mb-4">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{pt.player.staticPixKey}</p>
                  <p className="text-lg font-mono font-bold text-gray-100 break-all">{pixData.pix_key}</p>
                </div>

                <button
                  onClick={() => pixData.pix_key && handleCopy(pixData.pix_key)}
                  className="w-full mb-4 font-semibold py-2.5 rounded-xl transition-opacity hover:opacity-90 text-sm"
                  style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
                >
                  {copied ? pt.player.copied : pt.player.copyCode}
                </button>

                <div className="rounded-xl p-3 mb-4" style={{ backgroundColor: `${theme.primary_color}18`, border: `1px solid ${theme.primary_color}33` }}>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-0.5">Valor</p>
                  <p className="text-xl font-bold" style={{ color: theme.primary_color }}>{pt.currency(pixData.amount)}</p>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <div className="inline-block animate-spin rounded-full h-3 w-3 border border-gray-500 border-t-transparent" />
                  <p className="text-xs text-gray-500">{pt.player.staticPixWaiting}</p>
                </div>
              </div>
            )}

            {/* Mercado Pago QR Display */}
            {pixData && !isStaticPix && !isExpired && (
              <div className="ck-card rounded-2xl border border-white/10 p-6 text-center animate-fade-in-up">
                <h2 className="text-lg font-semibold text-gray-200 mb-4">{pt.player.pixTitle}</h2>
                <div className="bg-white rounded-xl p-3 inline-block mb-4">
                  <QRCode value={pixData.qr_code!} size={220} />
                </div>
                <p className="text-xs text-gray-500 mb-3">{pt.player.waitingPayment}</p>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={pixData.qr_code!}
                    className="w-full px-3 py-2 text-xs border border-white/10 rounded-lg bg-white/5 text-gray-300 pr-20"
                  />
                  <button
                    onClick={() => handleCopy(pixData.qr_code!)}
                    className="absolute right-1 top-1 px-3 py-1 text-xs rounded-md"
                    style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
                  >
                    {copied ? pt.player.copied : pt.player.copyCode}
                  </button>
                </div>
                <p className="text-sm font-semibold mt-3" style={{ color: theme.primary_color }}>{pt.currency(pixData.amount)}</p>
              </div>
            )}

            {/* Expired QR (MP only) */}
            {pixData && !isStaticPix && isExpired && (
              <div className="ck-card rounded-2xl border border-red-500/20 p-6 text-center animate-fade-in-up">
                <p className="text-red-400 font-medium mb-3">{pt.player.paymentExpired}</p>
                <button
                  onClick={data.status === "active" ? handleRebuy : handleBuyin}
                  className="font-semibold py-2.5 px-6 rounded-xl"
                  style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
                >
                  {pt.player.generateNew}
                </button>
              </div>
            )}

            {/* Active state — chip info + rebuy */}
            {data.status === "active" && !pixData && !sessionClosed && (
              <div className="space-y-4">
                {/* Main stats cards */}
                <div className={`grid ${data.blind_value > 0 ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
                  <StatCard label={pt.player.chipsIn} value={pt.currency(buyinAmount)} />
                  <StatCard label={pt.player.rebuys} value={pt.currency(confirmedRebuyTotal)} />
                  {data.blind_value > 0 && (
                    <StatCard label="Blinds" value={String(data.blinds_count)} />
                  )}
                </div>

                {/* Total invested */}
                <div className="ck-card rounded-2xl border border-white/10 p-4 text-center">
                  <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{pt.player.totalInvested}</p>
                  <p className="text-2xl font-bold text-gray-100">{pt.currency(data.total_chips_in)}</p>
                </div>

                {/* Action buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={fetchBreakdown}
                    className="bg-white/[0.06] border border-white/10 text-gray-300 font-medium py-3 rounded-xl hover:bg-white/10 transition-all text-sm"
                  >
                    {pt.player.verifyChips}
                  </button>
                  <button
                    onClick={handleRebuy}
                    disabled={pixLoading}
                    className="font-bold py-3 rounded-xl hover:brightness-110 transition-all text-sm disabled:opacity-50"
                    style={{ backgroundColor: theme.primary_color, color: theme.bg_color }}
                  >
                    {pixLoading ? pt.loading : pt.player.rebuyButton}
                  </button>
                </div>
              </div>
            )}

            {/* Waiting payment — trigger buy-in */}
            {data.status === "waiting_payment" && !pixData && !sessionClosed && (
              <div className="ck-card rounded-2xl border border-white/10 p-6 text-center animate-fade-in-up">
                <p className="text-gray-400 text-sm mb-4">Realize o pagamento para entrar na mesa</p>
                <button
                  onClick={handleBuyin}
                  disabled={pixLoading}
                  className="w-full font-bold py-3.5 rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                  style={{ backgroundColor: theme.primary_color, color: theme.bg_color }}
                >
                  {pixLoading ? pt.loading : "Buy-in"}
                </button>
              </div>
            )}

            {/* Cashed out summary */}
            {data.status === "cashed_out" && (
              <div className="ck-card rounded-2xl border border-white/10 p-5 animate-fade-in-up">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Investido</p>
                    <p className="text-lg font-bold text-gray-200 mt-1">{pt.currency(data.total_chips_in)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Cashout</p>
                    <p className="text-lg font-bold text-gray-200 mt-1">{pt.currency(data.total_chips_out)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase">Resultado</p>
                    <p className={`text-lg font-bold mt-1 ${data.total_chips_out - data.total_chips_in >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {data.total_chips_out - data.total_chips_in >= 0 ? "+" : ""}{pt.currency(data.total_chips_out - data.total_chips_in)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {pixError && (
              <p className="text-red-400 text-sm text-center">{pixError}</p>
            )}

            {/* Transaction history */}
            {data.transactions.length > 0 && (
              <div className="ck-card rounded-2xl border border-white/10 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {pt.player.transactionHistory}
                </h3>
                <div className="space-y-2.5">
                  {data.transactions.map((tx) => {
                    const statusStyle = tx.status === "confirmed"
                      ? "text-green-400"
                      : tx.status === "pending"
                        ? "text-yellow-400"
                        : "text-gray-500";
                    return (
                      <div key={tx.id} className="flex justify-between items-center text-sm border-b border-white/5 pb-2.5 last:border-0">
                        <div>
                          <span className="text-gray-300 font-medium">
                            {pt.txType[tx.type as keyof typeof pt.txType] ?? tx.type}
                          </span>
                          {tx.amount > 0 && (
                            <span className="text-gray-500 ml-2">{pt.currency(tx.amount)}</span>
                          )}
                        </div>
                        <span className={`text-xs font-medium ${statusStyle}`}>
                          {tx.status === "confirmed" ? "Confirmado" : tx.status === "pending" ? "Pendente" : tx.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            CASH KING TAB
            ══════════════════════════════════════════════════ */}
        {activeTab === "cashking" && (
          <>
            {ckLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mb-3" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
                <p className="text-gray-500 text-sm">{pt.loading}</p>
              </div>
            ) : (
              <>
                {/* Player's own position highlight */}
                {ckPlayerEntry ? (
                  <div className="ck-card rounded-2xl p-4 animate-fade-in-up" style={{ border: `1px solid ${theme.primary_color}33` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary_color}26` }}>
                        <span className={`text-lg font-black ${medalColors[ckPlayerIdx] ?? "text-gray-300"}`}>
                          {ckPlayerIdx + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-500 uppercase tracking-wider">{pt.player.yourPosition}</p>
                        <p className="text-lg font-bold text-gray-100">{ckPlayerEntry.total_pts.toFixed(1)} <span className="text-sm text-gray-500 font-normal">pts</span></p>
                      </div>
                      <Crown size={28} className="animate-crown-pulse" style={{ color: theme.primary_color }} />
                    </div>
                  </div>
                ) : (
                  <div className="ck-card rounded-2xl border border-white/10 p-4 text-center animate-fade-in-up">
                    <Crown size={32} className="text-gray-600 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">{pt.player.notRanked}</p>
                  </div>
                )}

                {/* Month label */}
                {ckMonth && (
                  <p className="text-center text-xs text-gray-500 uppercase tracking-wider">
                    {monthLabel(ckMonth)}
                  </p>
                )}

                {/* Leaderboard */}
                {ckEntries.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 text-sm">{pt.cashKing.noEntries}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ckEntries.map((entry, idx) => {
                      const isMe = entry.player.id === data.player_id;
                      const medal = medalColors[idx];
                      const maxPts = ckEntries[0]?.total_pts || 1;
                      const pctBar = (entry.total_pts / maxPts) * 100;
                      const expanded = ckExpandedId === entry.player.id;

                      return (
                        <div key={entry.player.id} className="animate-fade-in-up">
                          <button
                            onClick={() => loadCkScores(entry.player.id)}
                            className={`w-full rounded-xl p-3 flex items-center gap-3 transition-all text-left ${
                              isMe
                                ? ""
                                : "bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]"
                            }`}
                            style={isMe ? { backgroundColor: `${theme.primary_color}1a`, border: `1px solid ${theme.primary_color}33` } : undefined}
                          >
                            <span className={`w-7 text-center font-black text-sm ${medal ?? "text-gray-500"}`}>
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-sm font-medium truncate ${isMe ? "" : "text-gray-300"}`} style={isMe ? { color: theme.primary_color } : undefined}>
                                  {entry.player.name}
                                  {isMe && <span className="text-[10px] ml-1.5" style={{ color: `${theme.primary_color}99` }}>(voce)</span>}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ background: `linear-gradient(to right, ${theme.primary_color}99, ${theme.primary_color})`, width: `${pctBar}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-sm font-bold text-gray-200">{entry.total_pts.toFixed(1)}</span>
                              <p className="text-[10px] text-gray-500">{entry.session_count} sessoes</p>
                            </div>
                            <ChevronDown
                              size={14}
                              className={`text-gray-600 transition-transform ${expanded ? "rotate-180" : ""}`}
                            />
                          </button>

                          {/* Score breakdown */}
                          {expanded && (
                            <div className="mt-1 rounded-xl overflow-hidden border border-white/5 bg-white/[0.02] animate-fade-in-up">
                              {ckScoresLoading ? (
                                <div className="text-center py-4 text-gray-500 text-sm">{pt.loading}</div>
                              ) : ckScores.length === 0 ? (
                                <div className="text-center py-4 text-gray-600 text-sm">Sem detalhes</div>
                              ) : (
                                <div className="divide-y divide-white/5">
                                  {ckScores.map((s) => (
                                    <div key={s.id} className="px-4 py-2.5">
                                      <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-xs text-gray-400">{s.session_name || s.description || pt.cashKing.manual}</span>
                                        <span className="text-xs font-bold text-gray-300">{s.total_pts.toFixed(1)} pts</span>
                                      </div>
                                      <div className="flex flex-wrap gap-1.5">
                                        {s.attendance_pts > 0 && <ScoreBadge label={pt.cashKing.attendance} pts={s.attendance_pts} color="green" />}
                                        {s.hours_pts > 0 && <ScoreBadge label={pt.cashKing.hours} pts={s.hours_pts} color="blue" />}
                                        {s.croupier_pts > 0 && <ScoreBadge label={pt.cashKing.croupier} pts={s.croupier_pts} color="purple" />}
                                        {s.profit_pts !== 0 && <ScoreBadge label={pt.cashKing.profit} pts={s.profit_pts} color="yellow" />}
                                        {s.manual_adj !== 0 && <ScoreBadge label={pt.cashKing.adjustment} pts={s.manual_adj} color="gray" />}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ══════════════════════════════════════════════════
            HISTORY TAB
            ══════════════════════════════════════════════════ */}
        {activeTab === "history" && (
          <>
            {historyLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mb-3" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
                <p className="text-gray-500 text-sm">{pt.loading}</p>
              </div>
            ) : historyData ? (
              <>
                {/* Aggregate stats */}
                <div className="grid grid-cols-3 gap-3">
                  <StatCard label="Sessoes" value={String(historyData.total_sessions)} />
                  <StatCard
                    label={pt.player.netResult}
                    value={`${historyData.total_net >= 0 ? "+" : ""}${pt.currency(historyData.total_net)}`}
                    valueColor={historyData.total_net >= 0 ? "text-green-400" : "text-red-400"}
                  />
                  <StatCard
                    label="Total Investido"
                    value={pt.currency(historyData.items.reduce((acc, i) => acc + i.total_buyin, 0))}
                  />
                </div>

                {/* Session list */}
                {historyData.items.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 text-sm">{pt.player.noHistory}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {historyData.items.map((item) => (
                      <div
                        key={item.session_id}
                        className="ck-card rounded-xl border border-white/5 p-4 animate-fade-in-up"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-200 text-sm">{item.session_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(item.session_date).toLocaleDateString("pt-BR")}
                              {item.rebuy_count > 0 && (
                                <span className="ml-1.5 text-gray-600">{item.rebuy_count} rebuy(s)</span>
                              )}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${item.net_result >= 0 ? "text-green-400" : "text-red-400"}`}>
                              {item.net_result >= 0 ? "+" : ""}{pt.currency(item.net_result)}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {pt.currency(item.total_buyin)} investido
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-600 text-sm">{pt.player.noHistory}</p>
              </div>
            )}
          </>
        )}
        <PoweredBy color={theme.text_color} />
      </div>

      {/* ── Breakdown Modal ─────────────────────────────── */}
      {showBreakdown && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="ck-card rounded-2xl p-6 max-w-sm w-full border border-white/10 animate-fade-in-up">
            <div className="flex justify-between items-center border-b border-white/10 pb-4 mb-4">
              <h3 className="text-lg font-bold text-gray-200">{pt.player.verifyChips}</h3>
              <button onClick={() => setShowBreakdown(false)} className="text-gray-500 hover:text-gray-300 text-xl">&times;</button>
            </div>

            {loadingBreakdown ? (
              <div className="text-center py-6">
                <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-t-transparent" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
              </div>
            ) : breakdownData ? (
              <>
                <div className="text-center mb-4">
                  <p className="text-xs text-gray-500 uppercase">{pt.player.totalChipsCount}</p>
                  <p className="text-2xl font-bold text-gray-100">{breakdownData.totalCount}</p>
                </div>
                <div className="space-y-2 bg-white/[0.03] rounded-xl p-4">
                  {breakdownData.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full border border-white/10" style={{ backgroundColor: it.color || "#555" }} />
                        <span className="font-medium text-gray-300">{it.label}</span>
                      </div>
                      <span className="text-gray-400">{it.count}x</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center py-4 text-red-400 text-sm">{pt.error}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Stat Card ──────────────────────────────────────────────── */

function StatCard({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div className="ck-card rounded-xl border border-white/5 p-3 text-center">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-base font-bold mt-1 ${valueColor ?? "text-gray-100"}`}>{value}</p>
    </div>
  );
}

/* ── Score Badge ────────────────────────────────────────────── */

function ScoreBadge({ label, pts, color }: { label: string; pts: number; color: string }) {
  const colors: Record<string, string> = {
    green: "bg-green-500/15 text-green-400",
    blue: "bg-blue-500/15 text-blue-400",
    purple: "bg-purple-500/15 text-purple-400",
    yellow: "bg-yellow-500/15 text-yellow-400",
    gray: "bg-gray-500/15 text-gray-400",
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[color] ?? colors.gray}`}>
      {label} {pts > 0 ? "+" : ""}{pts.toFixed(1)}
    </span>
  );
}

/* ── Helpers ────────────────────────────────────────────────── */

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]} ${y}`;
}
