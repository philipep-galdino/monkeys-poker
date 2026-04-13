import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, SessionDetailResponse, SessionPlayerData, ChipBreakdownData, CashoutResult } from "@/api/client";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAppMode } from "@/hooks/useAppMode";
import { useClubTheme } from "@/hooks/useClubTheme";
import { pt } from "@/strings";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

type ReconciliationData = {
  total_chips_sold: number;
  total_chips_returned: number;
  total_collected_pix: number;
  total_collected_cash: number;
  total_rake: number;
  discrepancy: number;
  warning: string | null;
  cancelled_pending: number;
};

type UncashedPlayer = { id: string; name: string; total_chips_in: number; total_physical_chips: number };

export default function ClubDashboard() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";
  const { mode, basePath, loginPath } = useAppMode(clubId);
  const theme = useClubTheme(mode === "owner" ? clubId : undefined);

  const [clubName, setClubName] = useState("");
  const [session, setSession] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create session form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    blinds_info: "",
    buy_in_amount: "",
    rebuy_amount: "",
    allow_rebuys: true,
    table_limit: "9",
    cash_king_enabled: false,
  });

  // Cashout dialog
  const [cashoutTarget, setCashoutTarget] = useState<SessionPlayerData | null>(null);
  const [cashoutChips, setCashoutChips] = useState("");
  const [cashoutCroupierHours, setCashoutCroupierHours] = useState("");
  const [cashoutResult, setCashoutResult] = useState<{
    playerName: string;
    net_result: number;
    payout_amount: number | null;
    pix_key: string | null;
    payout_status: string | null;
    session_player_id: string;
    cash_king_pts: number | null;
  } | null>(null);

  // Close session dialog
  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [uncashedPlayers, setUncashedPlayers] = useState<UncashedPlayer[]>([]);

  // Action feedback
  const [actionMsg, setActionMsg] = useState("");

  // Verify payment modal
  const [verifyModal, setVerifyModal] = useState<{
    playerName: string;
    loading: boolean;
    result: null | { mp_status: string; updated: boolean };
    error: string | null;
  } | null>(null);

  // Add player dialog
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addPlayerForm, setAddPlayerForm] = useState({ name: "", phone: "", cashBuyIns: "0" });
  const [addPlayerError, setAddPlayerError] = useState("");
  const [allowMultipleBuyins, setAllowMultipleBuyins] = useState(false);
  const [buyInsBreakdown, setBuyInsBreakdown] = useState<ChipBreakdownData | null>(null);

  // Player history modal
  const [historyTargetId, setHistoryTargetId] = useState<string | null>(null);
  const [playerHistory, setPlayerHistory] = useState<Awaited<ReturnType<typeof api.getAdminPlayerHistory>> | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Chip breakdown modal
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownData, setBreakdownData] = useState<{
    name: string;
    totalValue: number;
    totalCount: number;
    items: { label: string; color: string | null; count: number }[];
    isFallback?: boolean;
  } | null>(null);
  const [breakdownNoInventory, setBreakdownNoInventory] = useState(false);

  const loadSession = useCallback(async () => {
    if (!clubId) return;
    try {
      // Load club name
      const club = await api.getClub(clubId, token);
      setClubName(club.name);
      setAllowMultipleBuyins(club.allow_multiple_buyins || false);

      const list = await api.listSessions(clubId, token, 1, 0);
      if (list.items.length > 0) {
        const detail = await api.getSession(clubId, list.items[0].id);
        setSession(detail);
        setShowCreate(false);
      } else {
        setSession(null);
        setShowCreate(true);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate(loginPath);
        return;
      }
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [clubId, token, navigate, loginPath]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // WebSocket for live updates
  useWebSocket({
    sessionId: session?.id,
    onEvent: useCallback(() => {
      loadSession();
    }, [loadSession]),
  });

  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    setError("");
    try {
      await api.createSession(
        clubId,
        {
          name: createForm.name,
          blinds_info: createForm.blinds_info,
          buy_in_amount: parseFloat(createForm.buy_in_amount),
          rebuy_amount: parseFloat(createForm.rebuy_amount),
          allow_rebuys: createForm.allow_rebuys,
          table_limit: parseInt(createForm.table_limit) || 9,
          cash_king_enabled: createForm.cash_king_enabled,
        },
        token,
      );
      await loadSession();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to create session");
    }
  };

  const handleAddPlayer = async (e: FormEvent) => {
    e.preventDefault();
    if (!session || !clubId) return;
    const digits = addPlayerForm.phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      setAddPlayerError("Phone must have 10 or 11 digits");
      return;
    }
    setAddPlayerError("");
    try {
      await api.joinSession(clubId, session.id, addPlayerForm.name, addPlayerForm.phone, parseInt(addPlayerForm.cashBuyIns) || 0);
      setActionMsg(`Player ${addPlayerForm.name} added manually.`);
      setShowAddPlayer(false);
      setAddPlayerForm({ name: "", phone: "", cashBuyIns: "0" });
      setAddPlayerError("");
      await loadSession();
    } catch (err) {
      setAddPlayerError(err instanceof ApiError ? err.detail : "Failed to add player");
    }
  };

  useEffect(() => {
    if (!allowMultipleBuyins || !session || !clubId) return;
    const buyIns = parseInt(addPlayerForm.cashBuyIns) || 0;

    if (buyIns > 0) {
      const chipValue =
        (session.buy_in_amount - session.rake_buyin) +
        Math.max(0, buyIns - 1) * (session.rebuy_amount - session.rake_rebuy);

      api
        .getChipBreakdown(clubId, chipValue, token)
        .then((data) => {
          setBuyInsBreakdown(data);
        })
        .catch(() => setBuyInsBreakdown(null));
    } else {
      setBuyInsBreakdown(null);
    }
  }, [addPlayerForm.cashBuyIns, allowMultipleBuyins, session, clubId, token]);

  const openHistory = async (playerId: string) => {
    if (!clubId) return;
    setHistoryTargetId(playerId);
    setLoadingHistory(true);
    setPlayerHistory(null);
    try {
      const data = await api.getAdminPlayerHistory(clubId, playerId, token);
      setPlayerHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const openBreakdown = async (sp: SessionPlayerData) => {
    if (!session || !clubId) return;

    setShowBreakdown(true);
    setLoadingBreakdown(true);
    setBreakdownData(null);
    setBreakdownNoInventory(false);

    try {
      const data = await api.getChipBreakdown(clubId, sp.total_chips_in, token);
      setBreakdownData({
        name: sp.player.name,
        totalValue: data.total_value,
        totalCount: data.total_chips_count,
        items: data.items,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setBreakdownNoInventory(true);
      }
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const handleCashPayment = async (sp: SessionPlayerData) => {
    if (!session || !clubId) return;
    try {
      await api.markCashPayment(clubId, session.id, sp.id, token);
      setActionMsg(`${sp.player.name} marked as paid (cash)`);
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleVerify = async (sp: SessionPlayerData) => {
    if (!session || !clubId) return;
    setVerifyModal({ playerName: sp.player.name, loading: true, result: null, error: null });
    try {
      const result = await api.verifyPayment(clubId, session.id, sp.id, token);
      setVerifyModal({ playerName: sp.player.name, loading: false, result, error: null });
      if (result.updated) await loadSession();
    } catch (err) {
      setVerifyModal({
        playerName: sp.player.name,
        loading: false,
        result: null,
        error: err instanceof ApiError ? err.detail : "Erro ao verificar pagamento",
      });
    }
  };

  const handleRebuyCash = async (sp: SessionPlayerData) => {
    if (!session || !clubId) return;
    try {
      await api.rebuyCash(clubId, session.id, sp.id, token);
      setActionMsg(`Rebuy registrado para ${sp.player.name}`);
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleCashout = async () => {
    if (!session || !cashoutTarget || !clubId) return;
    const chips = parseInt(cashoutChips);
    if (isNaN(chips) || chips < 0) return;
    const croupierHrs = cashoutCroupierHours ? parseFloat(cashoutCroupierHours) : undefined;
    try {
      const result = await api.cashoutPlayer(
        clubId, session.id, cashoutTarget.id, chips, token, undefined, croupierHrs,
      );
      setCashoutResult({
        playerName: cashoutTarget.player.name,
        net_result: result.net_result,
        payout_amount: result.payout_amount,
        pix_key: result.pix_key,
        payout_status: result.payout_status,
        session_player_id: result.session_player_id,
        cash_king_pts: result.cash_king_pts,
      });
      setCashoutTarget(null);
      setCashoutChips("");
      setCashoutCroupierHours("");
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleMarkPaid = async (sessionPlayerId: string) => {
    if (!session || !clubId) return;
    try {
      await api.markPayoutPaid(clubId, session.id, sessionPlayerId, token);
      setCashoutResult(null);
      setActionMsg("Pagamento marcado como realizado");
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleCloseSession = async (force = false) => {
    if (!session || !clubId) return;
    try {
      const result = await api.closeSession(clubId, session.id, token, force);
      setReconciliation(result as unknown as ReconciliationData);
      setShowCloseConfirm(false);
      setUncashedPlayers([]);
      await loadSession();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Parse uncashed players from error detail
        try {
          const detail = JSON.parse(err.detail);
          setUncashedPlayers(detail.uncashed_players ?? []);
        } catch {
          setUncashedPlayers([]);
        }
      } else {
        setActionMsg(err instanceof ApiError ? err.detail : "Error");
      }
    }
  };

  const initiateClose = async () => {
    // First try without force to check for uncashed players
    await handleCloseSession(false);
  };

  const isOwner = mode === "owner";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={isOwner ? { backgroundColor: theme.bg_color, color: theme.text_color } : { backgroundColor: "#f3f4f6" }}>
        <p style={isOwner ? { color: `${theme.text_color}99` } : { color: "#6b7280" }}>{pt.loading}</p>
      </div>
    );
  }

  // ── Theme-aware style helpers (DRY) ──────────────────────────
  // Owner mode: derive from club theme. Admin mode: static neutral palette.
  const t = {
    shell: isOwner
      ? { backgroundColor: theme.bg_color, color: theme.text_color, fontFamily: theme.font_family } as const
      : { backgroundColor: "#f3f4f6" } as const,
    card: isOwner
      ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 88%, white)`, border: `1px solid ${theme.text_color}15` }
      : { backgroundColor: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },
    modalBg: isOwner
      ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color }
      : { backgroundColor: "#fff" },
    input: isOwner
      ? { backgroundColor: `${theme.text_color}10`, border: `1px solid ${theme.text_color}20`, color: theme.text_color }
      : undefined,
    stat: isOwner
      ? { backgroundColor: `${theme.text_color}08`, color: theme.text_color }
      : { backgroundColor: "#f9fafb" },
    muted: isOwner ? { color: `${theme.text_color}99` } : { color: "#6b7280" },
    heading: isOwner ? { color: theme.text_color } : { color: "#1f2937" },
    primary: theme.primary_color,
    accent: theme.accent_color,
    text: isOwner ? theme.text_color : "#1f2937",
    cancelBtn: isOwner
      ? { backgroundColor: `${theme.text_color}12`, color: `${theme.text_color}cc` }
      : { backgroundColor: "#f3f4f6" },
    accentBtn: isOwner
      ? { backgroundColor: theme.accent_color, color: theme.text_color }
      : undefined,
    link: isOwner ? { color: theme.primary_color } : { color: "#2563eb" },
    linkHover: isOwner ? theme.primary_color : "#1d4ed8",
    borderB: isOwner ? { borderColor: `${theme.text_color}15` } : undefined,
    tableHead: isOwner
      ? { backgroundColor: `${theme.text_color}08`, color: `${theme.text_color}99` }
      : { backgroundColor: "#f9fafb", color: "#6b7280" },
  };

  const inputCls = "w-full px-3 py-2 rounded-lg outline-none";
  const cardCls = "rounded-xl p-6 mb-6";
  const cancelBtnCls = "flex-1 py-2 rounded-lg hover:opacity-90 text-sm transition-opacity";

  return (
    <div className="min-h-screen p-6" style={t.shell}>
      <div className="max-w-5xl mx-auto">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            {mode === "admin" && (
              <button
                onClick={() => navigate("/admin/clubs")}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                &larr; Clubes
              </button>
            )}
            {isOwner && theme.logo_url && (
              <img src={theme.logo_url} alt="" className="h-8 object-contain" />
            )}
            <h1
              className="text-2xl font-bold"
              style={isOwner ? { color: theme.primary_color } : { color: "#1f2937" }}
            >
              {clubName}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {[
              { label: pt.cashKing.title, path: `${basePath}/cash-king` },
              { label: "Histórico", path: `${basePath}/history` },
              { label: pt.admin.clubs.settingsTitle, path: `${basePath}/settings` },
            ].map((item) => (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={isOwner ? "text-sm opacity-70 hover:opacity-100 transition-opacity" : "text-sm text-gray-500 hover:text-gray-700"}
                style={isOwner ? { color: theme.text_color } : undefined}
              >
                {item.label}
              </button>
            ))}
            {isOwner && (
              <button
                onClick={() => navigate("/owner/profile")}
                className="text-sm opacity-70 hover:opacity-100 transition-opacity"
                style={{ color: theme.text_color }}
              >
                Perfil
              </button>
            )}
            <button
              onClick={() => {
                localStorage.removeItem("admin_token");
                localStorage.removeItem("auth_role");
                navigate(loginPath);
              }}
              className={isOwner ? "text-sm opacity-50 hover:opacity-80 transition-opacity" : "text-sm text-gray-500 hover:text-gray-700"}
              style={isOwner ? { color: theme.text_color } : undefined}
            >
              Sair
            </button>
          </div>
        </div>

        {error && (
          <div className={`rounded-lg p-3 mb-4 text-sm ${isOwner ? "bg-red-900/30 border border-red-500/30 text-red-300" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {error}
          </div>
        )}

        {actionMsg && (
          <div className={`rounded-lg p-3 mb-4 text-sm ${isOwner ? "bg-blue-900/20 border border-blue-500/30 text-blue-300" : "bg-blue-50 border border-blue-200 text-blue-700"}`}>
            {actionMsg}
            <button onClick={() => setActionMsg("")} className="ml-2 opacity-70 hover:opacity-100">×</button>
          </div>
        )}

        {/* Reconciliation result */}
        {reconciliation && (
          <div
            className={`rounded-lg p-4 mb-4 border ${isOwner
              ? reconciliation.warning ? "bg-yellow-900/20 border-yellow-500/30" : "bg-green-900/20 border-green-500/30"
              : reconciliation.warning ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"
            }`}
          >
            <h3 className="font-bold mb-2" style={t.heading}>Sessão Encerrada — Resumo</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span>Fichas Vendidas:</span>
              <span className="font-medium">{reconciliation.total_chips_sold}</span>
              <span>Fichas Devolvidas:</span>
              <span className="font-medium">{reconciliation.total_chips_returned}</span>
              <span>Recebido (Pix):</span>
              <span className="font-medium">{pt.currency(reconciliation.total_collected_pix)}</span>
              <span>Recebido (Dinheiro):</span>
              <span className="font-medium">{pt.currency(reconciliation.total_collected_cash)}</span>
              {reconciliation.total_rake > 0 && (
                <>
                  <span>Total Rake:</span>
                  <span className="font-medium">{pt.currency(reconciliation.total_rake)}</span>
                </>
              )}
              {reconciliation.cancelled_pending > 0 && (
                <>
                  <span>Pendências Canceladas:</span>
                  <span className="font-medium">{reconciliation.cancelled_pending}</span>
                </>
              )}
            </div>
            {reconciliation.warning && (
              <p className="mt-2 text-yellow-700 font-medium">
                {reconciliation.warning}
              </p>
            )}
            <button
              onClick={() => setReconciliation(null)}
              className="mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Fechar
            </button>
          </div>
        )}

        {/* Create session form */}
        {showCreate && (
          <div className={cardCls} style={t.card}>
            <h2 className="text-lg font-semibold mb-4">{pt.admin.dashboard.createSessionTitle}</h2>
            <form onSubmit={handleCreateSession} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">
                  {pt.admin.dashboard.sessionLabel}
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  placeholder="Cash Game - 03/04"
                  className={inputCls} style={t.input}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {pt.admin.dashboard.blindsLabel}
                </label>
                <input
                  type="number"
                  value={createForm.blinds_info}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, blinds_info: e.target.value })
                  }
                  placeholder="2"
                  className={inputCls} style={t.input}
                  required
                  min="0.01"
                  step="any"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {pt.admin.dashboard.buyinLabel}
                </label>
                <input
                  type="number"
                  value={createForm.buy_in_amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, buy_in_amount: e.target.value })
                  }
                  placeholder="100"
                  className={inputCls} style={t.input}
                  required
                  min="1"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {pt.admin.dashboard.rebuyLabel}
                </label>
                <input
                  type="number"
                  value={createForm.rebuy_amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, rebuy_amount: e.target.value })
                  }
                  placeholder="100"
                  className={inputCls} style={t.input}
                  required
                  min="1"
                  step="0.01"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createForm.allow_rebuys}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      allow_rebuys: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label className="text-sm" style={t.muted}>{pt.admin.dashboard.allowRebuys}</label>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">
                  {pt.admin.dashboard.tableLimit}
                </label>
                <input
                  type="number"
                  value={createForm.table_limit}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, table_limit: e.target.value })
                  }
                  className={inputCls} style={t.input}
                  required
                  min="1"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={createForm.cash_king_enabled}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      cash_king_enabled: e.target.checked,
                    })
                  }
                  className="w-4 h-4"
                />
                <label className="text-sm" style={t.muted}>{pt.cashKing.enableLabel}</label>
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full font-semibold py-2 rounded-lg transition-opacity"
                  style={t.accentBtn || { backgroundColor: "#2563eb", color: "#fff" }}
                >
                  {pt.admin.dashboard.createSessionSubmit}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Session dashboard */}
        {session && (
          <div className="rounded-xl p-6" style={t.card}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{session.name}</h2>
                <p className="text-sm" style={t.muted}>
                  Blind {pt.currency(parseFloat(session.blinds_info) || 0)} &middot; Buy-in{" "}
                  {pt.currency(session.buy_in_amount)} &middot;{" "}
                  <span
                    className={
                      session.status === "open"
                        ? "text-green-600"
                        : "text-gray-400"
                    }
                  >
                    {session.status === "open" ? "ABERTA" : "ENCERRADA"}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                {session.status === "open" && (
                  <>
                    <a
                      href={`/tv/${clubId}/${session.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 rounded text-sm font-medium transition-opacity hover:opacity-80"
                      style={isOwner ? { backgroundColor: `${theme.primary_color}20`, color: theme.primary_color, border: `1px solid ${theme.primary_color}30` } : { backgroundColor: "#dbeafe", color: "#1d4ed8" }}
                    >
                      {pt.admin.dashboard.tvLobby}
                    </a>
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                    >
                      {pt.admin.dashboard.closeSession}
                    </button>
                  </>
                )}
                {session.status === "closed" && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="px-3 py-1 rounded text-sm transition-opacity hover:opacity-80"
                    style={t.accentBtn || { backgroundColor: "#dbeafe", color: "#1d4ed8" }}
                  >
                    {pt.admin.dashboard.newSession}
                  </button>
                )}
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              {(() => {
                const isFull = !!(session.table_limit && session.session_players.length >= session.table_limit);
                const stats = [
                  {
                    value: `${session.session_players.length}${session.table_limit ? ` / ${session.table_limit}` : ""}`,
                    label: isFull ? "LOTADO" : pt.admin.dashboard.summary.players,
                    style: isFull ? { backgroundColor: isOwner ? "rgba(245,158,11,0.15)" : "#fef3c7", color: isOwner ? "#fbbf24" : "#92400e" } : t.stat,
                  },
                  {
                    value: pt.currency(session.session_players.reduce((sum, sp) => sum + sp.total_chips_in, 0)),
                    label: pt.admin.dashboard.summary.chipsIn,
                    style: t.stat,
                  },
                  {
                    value: pt.currency(
                      session.session_players
                        .flatMap((sp) => sp.transactions)
                        .filter((tx) => tx.status === "confirmed" && tx.payment_method === "pix" && tx.type !== "cash_out")
                        .reduce((sum, tx) => sum + tx.amount, 0),
                    ),
                    label: "Recebido (Pix)",
                    style: t.stat,
                  },
                  {
                    value: pt.currency(
                      session.session_players
                        .flatMap((sp) => sp.transactions)
                        .filter((tx) => tx.status === "confirmed" && tx.payment_method === "cash" && tx.type !== "cash_out")
                        .reduce((sum, tx) => sum + tx.amount, 0),
                    ),
                    label: "Recebido (Dinheiro)",
                    style: t.stat,
                  },
                ];
                return stats.map((s) => (
                  <div key={s.label} className="rounded-lg p-3 text-center" style={s.style}>
                    <p className="text-2xl font-bold" style={{ color: isOwner ? theme.primary_color : undefined }}>{s.value}</p>
                    <p className="text-xs uppercase font-medium" style={t.muted}>{s.label}</p>
                  </div>
                ));
              })()}
            </div>

            {/* Player list */}
            <div className="flex items-center justify-between mt-8 mb-4">
              <h3 className="text-lg font-semibold" style={t.heading}>{pt.admin.dashboard.summary.players}</h3>
              {session.status === "open" && (
                <button
                  onClick={() => setShowAddPlayer(true)}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm hover:bg-green-200"
                >
                  + {pt.admin.dashboard.actions.addPlayer}
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ ...t.borderB, ...t.muted }}>
                  <th className="py-2">{pt.admin.dashboard.playersTable.name}</th>
                  <th className="py-2">{pt.admin.dashboard.playersTable.phone}</th>
                  <th className="py-2">{pt.admin.dashboard.playersTable.status}</th>
                  <th className="py-2 text-right">{pt.admin.dashboard.playersTable.chipsIn}</th>
                  <th className="py-2 text-right">{pt.admin.dashboard.playersTable.chipsOut}</th>
                  {session.status === "open" && (
                    <th className="py-2 text-right">{pt.admin.dashboard.playersTable.actions}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {session.session_players.map((sp) => (
                  <tr key={sp.id} className="border-b">
                    <td className="py-3 font-medium">
                      <button 
                        onClick={() => openHistory(sp.player.id)}
                        className="hover:underline text-left cursor-pointer"
                        style={t.link}
                      >
                        {sp.player.name}
                      </button>
                    </td>
                    <td className="py-3" style={t.muted}>{sp.player.phone}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          sp.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : sp.status === "waiting_payment"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : isOwner ? "bg-white/10 opacity-60" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {pt.status[sp.status as keyof typeof pt.status] || sp.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {sp.total_chips_in > 0 ? (
                        <button
                          onClick={() => openBreakdown(sp)}
                          className="hover:underline cursor-pointer"
                          style={t.link}
                        >
                          {pt.currency(sp.total_chips_in)}
                        </button>
                      ) : (
                        pt.currency(0)
                      )}
                    </td>
                    <td className="py-3 text-right">{sp.total_chips_out > 0 ? pt.currency(sp.total_chips_out) : "—"}</td>
                    {session.status === "open" && (
                      <td className="py-3 text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          {sp.status === "waiting_payment" && (
                            <>
                              <button
                                onClick={() => handleCashPayment(sp)}
                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                              >
                                {pt.admin.dashboard.actions.markCash}
                              </button>
                              {sp.transactions.some(t => t.status === "pending") && (
                                <button
                                  onClick={() => handleVerify(sp)}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                >
                                  {pt.admin.dashboard.actions.verifyPayment}
                                </button>
                              )}
                            </>
                          )}
                          {sp.status === "active" && (
                            <>
                              {session.allow_rebuys && (
                                <button
                                  onClick={() => handleRebuyCash(sp)}
                                  className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs hover:bg-purple-200"
                                >
                                  Rebuy
                                </button>
                              )}
                              {sp.transactions.some(t => t.status === "pending") && (
                                <button
                                  onClick={() => handleVerify(sp)}
                                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                                >
                                  {pt.admin.dashboard.actions.verifyPayment}
                                </button>
                              )}
                              <button
                                onClick={() => setCashoutTarget(sp)}
                                className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200"
                              >
                                {pt.admin.dashboard.actions.cashout}
                              </button>
                            </>
                          )}
                          {sp.status === "cashed_out" && sp.payout_status === "pending" && (
                            <button
                              onClick={() => handleMarkPaid(sp.id)}
                              className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                            >
                              Pagar {pt.currency(sp.payout_amount || 0)}
                            </button>
                          )}
                          {sp.status === "cashed_out" && sp.payout_status === "paid" && (
                            <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded text-xs">
                              Pago ✓
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {session.session_players.length === 0 && (
              <p className="text-center py-8" style={t.muted}>
                {pt.admin.dashboard.playersTable.noPlayers}
              </p>
            )}
          </div>
        )}

        {/* Cashout dialog */}
        {cashoutTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-sm w-full mx-4`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              <h3 className="text-lg font-semibold mb-2">
                {pt.admin.modals.cashoutTitle} — {cashoutTarget.player.name}
              </h3>
              <p className="text-sm mb-4" style={t.muted}>
                Fichas em jogo: {pt.currency(cashoutTarget.total_chips_in)}
              </p>

              <label className="block text-xs mb-1 font-medium" style={t.muted}>Quanto o jogador está saindo? (R$)</label>
              <input
                type="number"
                value={cashoutChips}
                onChange={(e) => setCashoutChips(e.target.value)}
                placeholder="0"
                className={`${inputCls} mb-3`}
                style={t.input}
                min="0"
                autoFocus
              />

              {session?.cash_king_enabled && (
                <>
                  <label className="block text-xs mb-1 font-medium" style={t.muted}>{pt.cashKing.croupierHoursLabel}</label>
                  <input
                    type="number"
                    value={cashoutCroupierHours}
                    onChange={(e) => setCashoutCroupierHours(e.target.value)}
                    placeholder="0"
                    className={`${inputCls} mb-3`}
                    style={t.input}
                    min="0"
                    step="0.5"
                  />
                </>
              )}

              {cashoutChips && parseInt(cashoutChips) > 0 && (
                <div className="rounded-lg p-3 mb-4 text-sm" style={t.stat}>
                  <div className="flex justify-between">
                    <span style={t.muted}>Valor a pagar:</span>
                    <span className="font-bold" style={t.heading}>{pt.currency(parseInt(cashoutChips))}</span>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCashout}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600"
                >
                  Confirmar Cashout
                </button>
                <button
                  onClick={() => {
                    setCashoutTarget(null);
                    setCashoutChips("");
                  }}
                  className={cancelBtnCls} style={t.cancelBtn}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cashout result / payout modal */}
        {cashoutResult && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-sm w-full text-center`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              {cashoutResult.payout_amount && cashoutResult.payout_amount > 0 ? (
                <>
                  <p className="font-semibold text-lg mb-1" style={t.heading}>
                    {cashoutResult.playerName}
                  </p>
                  <p className="text-sm mb-2" style={t.muted}>Valor a pagar</p>
                  <p className="text-3xl font-bold mb-2" style={t.heading}>
                    {pt.currency(cashoutResult.payout_amount)}
                  </p>
                  {cashoutResult.cash_king_pts !== null && (
                    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-3 mb-4">
                      <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-0.5">{pt.cashKing.pointsEarned}</p>
                      <p className="text-2xl font-extrabold text-amber-600">{cashoutResult.cash_king_pts.toFixed(1)} <span className="text-sm font-medium">pts</span></p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleMarkPaid(cashoutResult.session_player_id)}
                      className={`flex-1 py-2 rounded-lg text-sm ${isOwner ? '' : 'bg-green-500 text-white hover:bg-green-600'}`}
                      style={isOwner ? { backgroundColor: theme.accent_color, color: theme.text_color } : undefined}
                    >
                      Já paguei
                    </button>
                    <button
                      onClick={() => setCashoutResult(null)}
                      className={cancelBtnCls} style={t.cancelBtn}
                    >
                      Pagar depois
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="font-semibold text-lg mb-1" style={t.heading}>
                    {cashoutResult.playerName}
                  </p>
                  <p className="text-sm mb-2" style={t.muted}>
                    Saiu sem fichas
                  </p>
                  {cashoutResult.cash_king_pts !== null && (
                    <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-3 mb-4">
                      <p className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold mb-0.5">{pt.cashKing.pointsEarned}</p>
                      <p className="text-2xl font-extrabold text-amber-600">{cashoutResult.cash_king_pts.toFixed(1)} <span className="text-sm font-medium">pts</span></p>
                    </div>
                  )}
                  <button
                    onClick={() => setCashoutResult(null)}
                    className="px-6 py-2 rounded-lg text-sm transition-opacity hover:opacity-80" style={t.cancelBtn}
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Add player modal */}
        {showAddPlayer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-sm w-full mx-4`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              <h3 className="text-lg font-semibold mb-4">{pt.admin.modals.addPlayerTitle}</h3>
              <form onSubmit={handleAddPlayer}>
                {addPlayerError && (
                  <div className={`rounded-lg p-2 mb-4 text-sm ${isOwner ? "bg-red-900/30 border border-red-500/30 text-red-300" : "bg-red-50 border border-red-200 text-red-700"}`}>
                    {addPlayerError}
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">
                    {pt.join.nameLabel}
                  </label>
                  <input
                    type="text"
                    value={addPlayerForm.name}
                    onChange={(e) => setAddPlayerForm({ ...addPlayerForm, name: e.target.value })}
                    className={inputCls} style={t.input}
                    placeholder="Ex: João Silva"
                    required
                    autoFocus
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1">
                    {pt.join.phoneLabel}
                  </label>
                  <input
                    type="tel"
                    value={addPlayerForm.phone}
                    onChange={(e) => setAddPlayerForm({ ...addPlayerForm, phone: formatPhone(e.target.value) })}
                    className={inputCls} style={t.input}
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>

                {allowMultipleBuyins && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">
                      Múltiplos Buy-ins (Opcional)
                    </label>
                    <input
                      type="number"
                      value={addPlayerForm.cashBuyIns}
                      onChange={(e) => setAddPlayerForm({ ...addPlayerForm, cashBuyIns: e.target.value })}
                      className={inputCls} style={t.input}
                      min="0"
                    />
                    {buyInsBreakdown && (
                      <div className="mt-2 p-3 rounded-lg text-sm" style={{ ...t.stat, border: `1px solid ${isOwner ? theme.text_color + '15' : '#e5e7eb'}` }}>
                        <div className="font-semibold mb-1">Total: R${buyInsBreakdown.total_value.toFixed(2)}</div>
                        <div className="text-xs">
                          {buyInsBreakdown.items.map(i => `${i.count}x ${i.label}`).join(" • ")}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-lg font-semibold bg-green-600 text-white hover:bg-green-500 transition-colors"
                  >
                    Adicionar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddPlayer(false);
                      setAddPlayerForm({ name: "", phone: "", cashBuyIns: "0" });
                      setAddPlayerError("");
                    }}
                    className={cancelBtnCls} style={t.cancelBtn}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Close session confirm */}
        {showCloseConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-md w-full mx-4`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              <h3 className="text-lg font-semibold mb-2">{pt.admin.modals.closeSessionConfirm}</h3>

              {uncashedPlayers.length > 0 ? (
                <>
                  <div className={`rounded-lg p-3 mb-4 ${isOwner ? "bg-yellow-900/20 border border-yellow-500/30" : "bg-yellow-50 border border-yellow-200"}`}>
                    <p className={`text-sm font-medium mb-2 ${isOwner ? "text-yellow-300" : "text-yellow-800"}`}>
                      {pt.admin.modals.closeSessionWarning}
                    </p>
                    <ul className={`text-sm space-y-1 ${isOwner ? "text-yellow-300/80" : "text-yellow-700"}`}>
                      {uncashedPlayers.map((p) => (
                        <li key={p.id}>
                          {p.name} — {pt.currency(p.total_chips_in)} em fichas
                        </li>
                      ))}
                    </ul>
                    <p className={`text-sm mt-2 ${isOwner ? "text-yellow-300" : "text-yellow-800"}`}>
                      Se prosseguir, eles serão encerrados automaticamente com <strong>0 fichas devolvidas</strong>.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCloseSession(true)}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
                    >
                      Forçar Encerramento
                    </button>
                    <button
                      onClick={() => {
                        setShowCloseConfirm(false);
                        setUncashedPlayers([]);
                      }}
                      className={cancelBtnCls} style={t.cancelBtn}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm mb-4" style={t.muted}>
                    Isso cancelará todos os pagamentos pendentes e encerrará a sessão.
                    Esta ação não pode ser desfeita.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={initiateClose}
                      className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
                    >
                      Encerrar Sessão
                    </button>
                    <button
                      onClick={() => setShowCloseConfirm(false)}
                      className={cancelBtnCls} style={t.cancelBtn}
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Player History Modal */}
        {historyTargetId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              <div className="flex justify-between items-center border-b pb-4 mb-4" style={t.borderB}>
                <h3 className="text-xl font-bold" style={t.heading}>{pt.admin.playerHistory.title}</h3>
                <button
                  onClick={() => setHistoryTargetId(null)}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  style={t.muted}
                >
                  Fechar
                </button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-8" style={t.muted}>{pt.loading}</div>
              ) : playerHistory ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    {[
                      { label: pt.admin.playerHistory.aggregate.totalSessions, value: String(playerHistory.total_sessions), color: isOwner ? theme.primary_color : undefined },
                      { label: pt.admin.playerHistory.aggregate.totalBuyin, value: `R$${playerHistory.items.reduce((acc, cur) => acc + cur.total_buyin, 0).toFixed(2)}`, color: isOwner ? theme.primary_color : "#2563eb" },
                      { label: pt.admin.playerHistory.aggregate.totalCashout, value: `${playerHistory.items.reduce((acc, cur) => acc + cur.total_cashout, 0)} fichas`, color: "#f97316" },
                      { label: pt.admin.playerHistory.aggregate.netResult, value: `R$${playerHistory.total_net.toFixed(2)}`, color: playerHistory.total_net >= 0 ? "#22c55e" : "#ef4444" },
                    ].map((s) => (
                      <div key={s.label} className="p-3 rounded text-center" style={t.stat}>
                        <div className="text-xs uppercase" style={t.muted}>{s.label}</div>
                        <div className="text-lg font-bold" style={s.color ? { color: s.color } : t.heading}>{s.value}</div>
                      </div>
                    ))}
                  </div>

                  <h4 className="font-semibold mb-3" style={t.heading}>Detalhes das Sessões</h4>
                  {playerHistory.items.length === 0 ? (
                    <p className="italic" style={t.muted}>Nenhuma sessão anterior encontrada.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg" style={isOwner ? { backgroundColor: `${theme.text_color}06` } : { backgroundColor: "#f9fafb" }}>
                      <table className="w-full text-sm text-left">
                        <thead>
                          <tr className="border-b" style={{ ...t.tableHead, ...t.borderB }}>
                            <th className="px-4 py-2">{pt.admin.playerHistory.table.session}</th>
                            <th className="px-4 py-2">{pt.admin.playerHistory.table.date}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.buyin}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.cashout}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.net}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerHistory.items.map((item) => (
                            <tr key={item.session_id} className="border-b" style={{ ...t.borderB, color: isOwner ? theme.text_color : undefined }}>
                              <td className="px-4 py-2 font-medium">{item.session_name}</td>
                              <td className="px-4 py-2" style={t.muted}>{new Date(item.session_date).toLocaleDateString()}</td>
                              <td className="px-4 py-2 text-right">R${item.total_buyin.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">{item.total_cashout} fichas</td>
                              <td className={`px-4 py-2 text-right font-medium ${item.net_result >= 0 ? "text-green-400" : "text-red-400"}`}>
                                R${item.net_result.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-red-400">Erro ao carregar histórico.</div>
              )}
            </div>
          </div>
        )}

        {/* Chip Breakdown Modal */}
        {showBreakdown && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-sm w-full`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              <div className="flex justify-between items-center border-b pb-4 mb-4" style={t.borderB}>
                <h3 className="text-xl font-bold" style={t.heading}>Kit de Fichas</h3>
                <button
                  onClick={() => setShowBreakdown(false)}
                  className="opacity-60 hover:opacity-100 transition-opacity"
                  style={t.muted}
                >
                  Fechar
                </button>
              </div>

              {loadingBreakdown ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 mx-auto mb-2" style={{ borderColor: theme.primary_color }}></div>
                  <p className="text-sm" style={t.muted}>Calculando kit...</p>
                </div>
              ) : breakdownData ? (
                <>
                  <div className="text-center mb-4">
                    <div className="text-sm font-medium" style={t.heading}>{breakdownData.name}</div>
                    <div className="flex flex-col mt-1">
                      <span className="text-xs" style={t.muted}>Valor Total: <strong style={t.heading}>R$ {breakdownData.totalValue}</strong></span>
                      <span className="text-xs" style={t.muted}>Total de Fichas: <strong style={t.heading}>{breakdownData.totalCount} unidades</strong></span>
                    </div>
                  </div>

                  {breakdownData.isFallback && (
                    <div className={`text-[10px] p-2 rounded mb-3 leading-tight ${isOwner ? "bg-amber-500/10 border border-amber-500/20 text-amber-300" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                      <strong>Aviso:</strong> Kit gerado com base no inventário atual e blinds da sessão (30 BBs base).
                    </div>
                  )}

                  <div className="rounded-lg p-4" style={isOwner ? { backgroundColor: `${theme.text_color}08`, border: `1px solid ${theme.text_color}12` } : { backgroundColor: "#f9fafb", border: "1px solid #e5e7eb" }}>
                    <div className="space-y-2">
                      {breakdownData.items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: item.color || (isOwner ? `${theme.text_color}30` : "#e5e7eb"), border: `1px solid ${isOwner ? theme.text_color + '20' : '#d1d5db'}` }}
                            />
                            <span className="font-medium" style={t.heading}>{item.label}</span>
                          </div>
                          <span className="font-semibold" style={t.muted}>{item.count}x</span>
                        </div>
                      ))}
                      {breakdownData.items.length === 0 && (
                        <div className="text-center text-red-400 text-xs py-2">
                          Não foi possível calcular a distribuição (fichas insuficientes).
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : breakdownNoInventory ? (
                <div className="text-center py-8">
                  <p className="text-3xl mb-3">🎰</p>
                  <p className="font-semibold mb-1" style={t.heading}>Inventário de fichas não configurado</p>
                  <p className="text-sm mb-4" style={t.muted}>
                    Configure o inventário de fichas do clube para que possamos calcular o kit ideal para cada jogador.
                  </p>
                  <button
                    onClick={() => {
                      setShowBreakdown(false);
                      navigate(`${basePath}/settings`);
                    }}
                    className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                    style={{ backgroundColor: theme.primary_color, color: isOwner ? theme.bg_color : "#fff" }}
                  >
                    Configurar Fichas
                  </button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-red-400 text-sm">Erro ao carregar distribuição de fichas.</p>
                </div>
              )}
            </div>
          </div>
        )}
        {/* Verify Payment Modal */}
        {verifyModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className={`${isOwner ? '' : 'bg-white'} rounded-xl p-6 max-w-sm w-full text-center`} style={isOwner ? { backgroundColor: `color-mix(in srgb, ${theme.bg_color} 95%, white)`, border: `1px solid ${theme.text_color}15`, color: theme.text_color } : undefined}>
              {verifyModal.loading ? (
                <>
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 mx-auto mb-4" style={{ borderColor: isOwner ? theme.primary_color : "#2563eb" }}></div>
                  <p className="font-medium" style={t.heading}>Verificando pagamento...</p>
                  <p className="text-sm mt-1" style={t.muted}>{verifyModal.playerName}</p>
                </>
              ) : verifyModal.error ? (
                <>
                  <div className="text-red-500 text-4xl mb-3">✕</div>
                  <p className="font-semibold mb-1" style={t.heading}>Erro na verificação</p>
                  <p className="text-sm text-red-400 mb-4">{verifyModal.error}</p>
                  <button
                    onClick={() => setVerifyModal(null)}
                    className="px-6 py-2 rounded-lg text-sm transition-opacity hover:opacity-80" style={t.cancelBtn}
                  >
                    Fechar
                  </button>
                </>
              ) : verifyModal.result?.updated ? (
                <>
                  <div className="text-green-500 text-4xl mb-3">✓</div>
                  <p className="font-semibold mb-1" style={t.heading}>Pagamento confirmado!</p>
                  <p className="text-sm mb-4" style={t.muted}>
                    {verifyModal.playerName} — fichas liberadas
                  </p>
                  <button
                    onClick={() => setVerifyModal(null)}
                    className={`px-6 py-2 rounded-lg text-sm ${isOwner ? '' : 'bg-green-500 text-white hover:bg-green-600'}`}
                    style={isOwner ? { backgroundColor: theme.accent_color, color: theme.text_color } : undefined}
                  >
                    OK
                  </button>
                </>
              ) : (
                <>
                  <div className="text-yellow-500 text-4xl mb-3">⏳</div>
                  <p className="font-semibold mb-1" style={t.heading}>Aguardando pagamento</p>
                  <p className="text-sm mb-4" style={t.muted}>
                    O Mercado Pago ainda não confirmou o pagamento de {verifyModal.playerName}.
                  </p>
                  <button
                    onClick={() => setVerifyModal(null)}
                    className="px-6 py-2 rounded-lg text-sm transition-opacity hover:opacity-80" style={t.cancelBtn}
                  >
                    Fechar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
