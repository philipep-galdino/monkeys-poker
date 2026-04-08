import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, SessionDetailResponse, SessionPlayerData, ChipBreakdownData } from "@/api/client";
import { useWebSocket } from "@/hooks/useWebSocket";
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
  });

  // Cashout dialog
  const [cashoutTarget, setCashoutTarget] = useState<SessionPlayerData | null>(null);
  const [cashoutChips, setCashoutChips] = useState("");

  // Close session dialog
  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [uncashedPlayers, setUncashedPlayers] = useState<UncashedPlayer[]>([]);

  // Action feedback
  const [actionMsg, setActionMsg] = useState("");

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
        navigate("/admin");
        return;
      }
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [clubId, token, navigate]);

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

    try {
      const data = await api.getChipBreakdown(clubId, sp.total_chips_in, token);
      setBreakdownData({
        name: sp.player.name,
        totalValue: data.total_value,
        totalCount: data.total_chips_count,
        items: data.items,
      });
    } catch (err) {
      console.error(err);
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
    try {
      const result = await api.verifyPayment(clubId, session.id, sp.id, token);
      setActionMsg(
        `${sp.player.name}: MP status = ${result.mp_status}${result.updated ? " (updated)" : ""}`,
      );
      if (result.updated) await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
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
    try {
      await api.cashoutPlayer(clubId, session.id, cashoutTarget.id, chips, token);
      setActionMsg(`${cashoutTarget.player.name} cashed out with ${chips} chips`);
      setCashoutTarget(null);
      setCashoutChips("");
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">{pt.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Top nav */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/admin/clubs")}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              &larr; Clubes
            </button>
            <h1 className="text-2xl font-bold text-gray-800">{clubName}</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/admin/clubs/${clubId}/history`)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Histórico
            </button>
            <button
              onClick={() => navigate(`/admin/clubs/${clubId}/settings`)}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {pt.admin.clubs.settingsTitle}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("admin_token");
                navigate("/admin");
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Sair
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {actionMsg && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-blue-700 text-sm">
            {actionMsg}
            <button
              onClick={() => setActionMsg("")}
              className="ml-2 text-blue-500 hover:text-blue-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Reconciliation result */}
        {reconciliation && (
          <div
            className={`rounded-lg p-4 mb-4 border ${reconciliation.warning ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}`}
          >
            <h3 className="font-bold mb-2">Sessão Encerrada — Resumo</h3>
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
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">{pt.admin.dashboard.createSessionTitle}</h2>
            <form onSubmit={handleCreateSession} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.dashboard.sessionLabel}
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, name: e.target.value })
                  }
                  placeholder="Cash Game - 03/04"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.dashboard.blindsLabel}
                </label>
                <input
                  type="number"
                  value={createForm.blinds_info}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, blinds_info: e.target.value })
                  }
                  placeholder="2"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  min="0.01"
                  step="any"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.dashboard.buyinLabel}
                </label>
                <input
                  type="number"
                  value={createForm.buy_in_amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, buy_in_amount: e.target.value })
                  }
                  placeholder="100"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  min="1"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.dashboard.rebuyLabel}
                </label>
                <input
                  type="number"
                  value={createForm.rebuy_amount}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, rebuy_amount: e.target.value })
                  }
                  placeholder="100"
                  className="w-full px-3 py-2 border rounded-lg"
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
                <label className="text-sm text-gray-700">{pt.admin.dashboard.allowRebuys}</label>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.dashboard.tableLimit}
                </label>
                <input
                  type="number"
                  value={createForm.table_limit}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, table_limit: e.target.value })
                  }
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  min="1"
                />
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700"
                >
                  {pt.admin.dashboard.createSessionSubmit}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Session dashboard */}
        {session && (
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold">{session.name}</h2>
                <p className="text-sm text-gray-500">
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
                      className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
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
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                  >
                    {pt.admin.dashboard.newSession}
                  </button>
                )}
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className={`rounded-lg p-3 text-center ${session.table_limit && session.session_players.length >= session.table_limit ? "bg-amber-100 text-amber-900 border border-amber-200" : "bg-gray-50"}`}>
                <p className="text-2xl font-bold">
                  {session.session_players.length}{session.table_limit ? ` / ${session.table_limit}` : ""}
                </p>
                <p className="text-xs text-gray-500 uppercase font-medium">
                  {session.table_limit && session.session_players.length >= session.table_limit ? "LOTADO" : pt.admin.dashboard.summary.players}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {pt.currency(
                    session.session_players.reduce(
                      (sum, sp) => sum + sp.total_chips_in,
                      0,
                    ),
                  )}
                </p>
                <p className="text-xs text-gray-500">{pt.admin.dashboard.summary.chipsIn}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {pt.currency(
                    session.session_players
                      .flatMap((sp) => sp.transactions)
                      .filter(
                        (t) =>
                          t.status === "confirmed" &&
                          t.payment_method === "pix" &&
                          t.type !== "cash_out",
                      )
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </p>
                <p className="text-xs text-gray-500">Recebido (Pix)</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {pt.currency(
                    session.session_players
                      .flatMap((sp) => sp.transactions)
                      .filter(
                        (t) =>
                          t.status === "confirmed" &&
                          t.payment_method === "cash" &&
                          t.type !== "cash_out",
                      )
                      .reduce((sum, t) => sum + t.amount, 0),
                  )}
                </p>
                <p className="text-xs text-gray-500">Recebido (Dinheiro)</p>
              </div>
            </div>

            {/* Player list */}
            <div className="flex items-center justify-between mt-8 mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{pt.admin.dashboard.summary.players}</h3>
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
                <tr className="border-b text-left text-gray-500">
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
                        className="text-blue-600 hover:text-blue-800 hover:underline text-left cursor-pointer"
                      >
                        {sp.player.name}
                      </button>
                    </td>
                    <td className="py-3 text-gray-500">{sp.player.phone}</td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          sp.status === "active"
                            ? "bg-green-100 text-green-700"
                            : sp.status === "waiting_payment"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {pt.status[sp.status as keyof typeof pt.status] || sp.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {sp.total_chips_in > 0 ? (
                        <button
                          onClick={() => openBreakdown(sp)}
                          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
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
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {session.session_players.length === 0 && (
              <p className="text-center text-gray-400 py-8">
                {pt.admin.dashboard.playersTable.noPlayers}
              </p>
            )}
          </div>
        )}

        {/* Cashout dialog */}
        {cashoutTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">
                {pt.admin.modals.cashoutTitle} — {cashoutTarget.player.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Fichas em jogo: {pt.currency(cashoutTarget.total_chips_in)}
              </p>
              <input
                type="number"
                value={cashoutChips}
                onChange={(e) => setCashoutChips(e.target.value)}
                placeholder="Valor em fichas devolvidas"
                className="w-full px-3 py-2 border rounded-lg mb-4"
                min="0"
                autoFocus
              />
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
                  className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add player modal */}
        {showAddPlayer && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-4">{pt.admin.modals.addPlayerTitle}</h3>
              <form onSubmit={handleAddPlayer}>
                {addPlayerError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2 mb-4 text-red-700 text-sm">
                    {addPlayerError}
                  </div>
                )}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {pt.join.nameLabel}
                  </label>
                  <input
                    type="text"
                    value={addPlayerForm.name}
                    onChange={(e) => setAddPlayerForm({ ...addPlayerForm, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="Ex: João Silva"
                    required
                    autoFocus
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {pt.join.phoneLabel}
                  </label>
                  <input
                    type="tel"
                    value={addPlayerForm.phone}
                    onChange={(e) => setAddPlayerForm({ ...addPlayerForm, phone: formatPhone(e.target.value) })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="(11) 99999-9999"
                    required
                  />
                </div>

                {allowMultipleBuyins && (
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Múltiplos Buy-ins (Opcional)
                    </label>
                    <input
                      type="number"
                      value={addPlayerForm.cashBuyIns}
                      onChange={(e) => setAddPlayerForm({ ...addPlayerForm, cashBuyIns: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg"
                      min="0"
                    />
                    {buyInsBreakdown && (
                      <div className="mt-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
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
                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700"
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
                    className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
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
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">{pt.admin.modals.closeSessionConfirm}</h3>

              {uncashedPlayers.length > 0 ? (
                <>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-yellow-800 font-medium mb-2">
                      {pt.admin.modals.closeSessionWarning}
                    </p>
                    <ul className="text-sm text-yellow-700 space-y-1">
                      {uncashedPlayers.map((p) => (
                        <li key={p.id}>
                          {p.name} — {pt.currency(p.total_chips_in)} em fichas
                        </li>
                      ))}
                    </ul>
                    <p className="text-sm text-yellow-800 mt-2">
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
                      className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-500 mb-4">
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
                      className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
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
            <div className="bg-white rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h3 className="text-xl font-bold">{pt.admin.playerHistory.title}</h3>
                <button
                  onClick={() => setHistoryTargetId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  Fechar
                </button>
              </div>

              {loadingHistory ? (
                <div className="text-center py-8 text-gray-500">{pt.loading}</div>
              ) : playerHistory ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-50 p-3 rounded text-center">
                      <div className="text-xs text-gray-500 uppercase">{pt.admin.playerHistory.aggregate.totalSessions}</div>
                      <div className="text-lg font-bold">{playerHistory.total_sessions}</div>
                    </div>
                    <div className="bg-blue-50 p-3 rounded text-center">
                      <div className="text-xs text-blue-500 uppercase">{pt.admin.playerHistory.aggregate.totalBuyin}</div>
                      <div className="text-lg font-bold text-blue-700">R${playerHistory.items.reduce((acc, cur) => acc + cur.total_buyin, 0).toFixed(2)}</div>
                    </div>
                    <div className="bg-orange-50 p-3 rounded text-center">
                      <div className="text-xs text-orange-500 uppercase">{pt.admin.playerHistory.aggregate.totalCashout}</div>
                      <div className="text-lg font-bold text-orange-700">{playerHistory.items.reduce((acc, cur) => acc + cur.total_cashout, 0)} fichas</div>
                    </div>
                    <div className={`p-3 rounded text-center ${playerHistory.total_net >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                      <div className={`text-xs uppercase ${playerHistory.total_net >= 0 ? "text-green-500" : "text-red-500"}`}>{pt.admin.playerHistory.aggregate.netResult}</div>
                      <div className={`text-lg font-bold ${playerHistory.total_net >= 0 ? "text-green-700" : "text-red-700"}`}>
                        R${playerHistory.total_net.toFixed(2)}
                      </div>
                    </div>
                  </div>

                  <h4 className="font-semibold mb-3">Detalhes das Sessões</h4>
                  {playerHistory.items.length === 0 ? (
                    <p className="text-gray-500 italic">Nenhuma sessão anterior encontrada.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-2">{pt.admin.playerHistory.table.session}</th>
                            <th className="px-4 py-2">{pt.admin.playerHistory.table.date}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.buyin}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.cashout}</th>
                            <th className="px-4 py-2 text-right">{pt.admin.playerHistory.table.net}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {playerHistory.items.map((item) => (
                            <tr key={item.session_id} className="border-b">
                              <td className="px-4 py-2 font-medium">{item.session_name}</td>
                              <td className="px-4 py-2 text-gray-500">{new Date(item.session_date).toLocaleDateString()}</td>
                              <td className="px-4 py-2 text-right">R${item.total_buyin.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right">{item.total_cashout} fichas</td>
                              <td className={`px-4 py-2 text-right font-medium ${item.net_result >= 0 ? "text-green-600" : "text-red-600"}`}>
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
                <div className="text-center py-8 text-red-500">Erro ao carregar histórico.</div>
              )}
            </div>
          </div>
        )}

        {/* Chip Breakdown Modal */}
        {showBreakdown && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h3 className="text-xl font-bold">Kit de Fichas</h3>
                <button
                  onClick={() => setShowBreakdown(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  Fechar
                </button>
              </div>

              {loadingBreakdown ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-500 text-sm">Calculando kit...</p>
                </div>
              ) : breakdownData ? (
                <>
                  <div className="text-center mb-4 text-gray-700">
                    <div className="text-sm font-medium">{breakdownData.name}</div>
                    <div className="flex flex-col mt-1">
                      <span className="text-xs text-gray-500">Valor Total: <strong className="text-gray-800">R$ {breakdownData.totalValue}</strong></span>
                      <span className="text-xs text-gray-500">Total de Fichas: <strong className="text-gray-800">{breakdownData.totalCount} unidades</strong></span>
                    </div>
                  </div>

                  {breakdownData.isFallback && (
                    <div className="bg-amber-50 border border-amber-200 text-amber-800 text-[10px] p-2 rounded mb-3 leading-tight">
                      <strong>Aviso:</strong> Kit gerado com base no inventário atual e blinds da sessão (30 BBs base).
                    </div>
                  )}

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <div className="space-y-2">
                      {breakdownData.items.map((item, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <div className="flex items-center gap-2">
                            <span 
                              className="w-3 h-3 rounded-full border border-gray-300" 
                              style={{ backgroundColor: item.color || "#e5e7eb" }} 
                            />
                            <span className="font-medium">{item.label}</span>
                          </div>
                          <span className="text-gray-600 font-semibold">{item.count}x</span>
                        </div>
                      ))}
                      {breakdownData.items.length === 0 && (
                        <div className="text-center text-red-500 text-xs py-2">
                          Não foi possível calcular a distribuição (fichas insuficientes).
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-red-500 text-sm">
                  Erro ao carregar distribuição de fichas.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
