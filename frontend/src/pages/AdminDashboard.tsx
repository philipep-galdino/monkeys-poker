import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, SessionDetailResponse, SessionPlayerData } from "@/api/client";
import { useWebSocket } from "@/hooks/useWebSocket";
import { pt } from "@/strings";

type ReconciliationData = {
  total_chips_sold: number;
  total_chips_returned: number;
  total_collected_pix: number;
  total_collected_cash: number;
  discrepancy: number;
  warning: string | null;
  cancelled_pending: number;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";

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
  });

  // Cashout dialog
  const [cashoutTarget, setCashoutTarget] = useState<SessionPlayerData | null>(null);
  const [cashoutChips, setCashoutChips] = useState("");

  // Close session dialog
  const [reconciliation, setReconciliation] = useState<ReconciliationData | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  // Action feedback
  const [actionMsg, setActionMsg] = useState("");

  const loadSession = useCallback(async () => {
    try {
      const list = await api.listSessions(token, 1, 0);
      if (list.items.length > 0) {
        const detail = await api.getSession(list.items[0].id);
        setSession(detail);
        setShowCreate(false);
      } else {
        setSession(null);
        setShowCreate(true);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        navigate("/admin");
        return;
      }
      setError("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

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
    setError("");
    try {
      await api.createSession(
        {
          name: createForm.name,
          blinds_info: createForm.blinds_info,
          buy_in_amount: parseFloat(createForm.buy_in_amount),
          rebuy_amount: parseFloat(createForm.rebuy_amount),
          allow_rebuys: createForm.allow_rebuys,
        },
        token,
      );
      await loadSession();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to create session");
    }
  };

  const handleCashPayment = async (sp: SessionPlayerData) => {
    if (!session) return;
    try {
      await api.markCashPayment(session.id, sp.id, token);
      setActionMsg(`${sp.player.name} marked as paid (cash)`);
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleVerify = async (sp: SessionPlayerData) => {
    if (!session) return;
    try {
      const result = await api.verifyPayment(session.id, sp.id, token);
      setActionMsg(
        `${sp.player.name}: MP status = ${result.mp_status}${result.updated ? " (updated)" : ""}`,
      );
      if (result.updated) await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleCashout = async () => {
    if (!session || !cashoutTarget) return;
    const chips = parseInt(cashoutChips);
    if (isNaN(chips) || chips < 0) return;
    try {
      await api.cashoutPlayer(session.id, cashoutTarget.id, chips, token);
      setActionMsg(`${cashoutTarget.player.name} cashed out with ${chips} chips`);
      setCashoutTarget(null);
      setCashoutChips("");
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  const handleCloseSession = async () => {
    if (!session) return;
    try {
      const result = await api.closeSession(session.id, token);
      setReconciliation(result as unknown as ReconciliationData);
      setShowCloseConfirm(false);
      await loadSession();
    } catch (err) {
      setActionMsg(err instanceof ApiError ? err.detail : "Error");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Admin Dashboard</h1>
          <button
            onClick={() => {
              localStorage.removeItem("admin_token");
              navigate("/admin");
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Logout
          </button>
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
            <h3 className="font-bold mb-2">Session Closed — Reconciliation</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span>Chips Sold:</span>
              <span className="font-medium">{reconciliation.total_chips_sold}</span>
              <span>Chips Returned:</span>
              <span className="font-medium">{reconciliation.total_chips_returned}</span>
              <span>Collected (Pix):</span>
              <span className="font-medium">{pt.currency(reconciliation.total_collected_pix)}</span>
              <span>Collected (Cash):</span>
              <span className="font-medium">{pt.currency(reconciliation.total_collected_cash)}</span>
              {reconciliation.cancelled_pending > 0 && (
                <>
                  <span>Cancelled Pending:</span>
                  <span className="font-medium">{reconciliation.cancelled_pending}</span>
                </>
              )}
            </div>
            {reconciliation.warning && (
              <p className="mt-2 text-yellow-700 font-medium">
                ⚠ {reconciliation.warning}
              </p>
            )}
            <button
              onClick={() => setReconciliation(null)}
              className="mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create session form */}
        {showCreate && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">Create Session</h2>
            <form onSubmit={handleCreateSession} className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Session Name
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
                  Blinds
                </label>
                <input
                  type="text"
                  value={createForm.blinds_info}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, blinds_info: e.target.value })
                  }
                  placeholder="1/2"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Buy-in (R$)
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
                  Rebuy (R$)
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
                <label className="text-sm text-gray-700">Allow Rebuys</label>
              </div>
              <div className="col-span-2">
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700"
                >
                  Create Session
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
                  Blinds {session.blinds_info} &middot; Buy-in{" "}
                  {pt.currency(session.buy_in_amount)} &middot;{" "}
                  <span
                    className={
                      session.status === "open"
                        ? "text-green-600"
                        : "text-gray-400"
                    }
                  >
                    {session.status.toUpperCase()}
                  </span>
                </p>
              </div>
              <div className="flex gap-2">
                {session.status === "open" && (
                  <>
                    <a
                      href={`/tv/${session.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 bg-gray-100 rounded text-sm hover:bg-gray-200"
                    >
                      TV Lobby
                    </a>
                    <button
                      onClick={() => setShowCloseConfirm(true)}
                      className="px-3 py-1 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200"
                    >
                      Close Session
                    </button>
                  </>
                )}
                {session.status === "closed" && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                  >
                    New Session
                  </button>
                )}
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {session.session_players.length}
                </p>
                <p className="text-xs text-gray-500">Players</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">
                  {session.session_players.reduce(
                    (sum, sp) => sum + sp.total_chips_in,
                    0,
                  )}
                </p>
                <p className="text-xs text-gray-500">Total Chips In</p>
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
                <p className="text-xs text-gray-500">Collected (Pix)</p>
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
                <p className="text-xs text-gray-500">Collected (Cash)</p>
              </div>
            </div>

            {/* Player list */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2">Player</th>
                  <th className="py-2">Phone</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Chips In</th>
                  <th className="py-2 text-right">Chips Out</th>
                  {session.status === "open" && (
                    <th className="py-2 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {session.session_players.map((sp) => (
                  <tr key={sp.id} className="border-b">
                    <td className="py-3 font-medium">{sp.player.name}</td>
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
                        {sp.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">{sp.total_chips_in}</td>
                    <td className="py-3 text-right">{sp.total_chips_out}</td>
                    {session.status === "open" && (
                      <td className="py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          {sp.status === "waiting_payment" && (
                            <>
                              <button
                                onClick={() => handleCashPayment(sp)}
                                className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                              >
                                Cash
                              </button>
                              <button
                                onClick={() => handleVerify(sp)}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                              >
                                Verify
                              </button>
                            </>
                          )}
                          {sp.status === "active" && (
                            <>
                              <button
                                onClick={() => handleVerify(sp)}
                                className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                              >
                                Verify
                              </button>
                              <button
                                onClick={() => setCashoutTarget(sp)}
                                className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs hover:bg-orange-200"
                              >
                                Cashout
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
                No players yet
              </p>
            )}
          </div>
        )}

        {/* Cashout dialog */}
        {cashoutTarget && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">
                Cashout — {cashoutTarget.player.name}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Chips in: {cashoutTarget.total_chips_in}
              </p>
              <input
                type="number"
                value={cashoutChips}
                onChange={(e) => setCashoutChips(e.target.value)}
                placeholder="Chips returned"
                className="w-full px-3 py-2 border rounded-lg mb-4"
                min="0"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCashout}
                  className="flex-1 bg-orange-500 text-white py-2 rounded-lg hover:bg-orange-600"
                >
                  Confirm Cashout
                </button>
                <button
                  onClick={() => {
                    setCashoutTarget(null);
                    setCashoutChips("");
                  }}
                  className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Close session confirm */}
        {showCloseConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
              <h3 className="text-lg font-semibold mb-2">Close Session?</h3>
              <p className="text-sm text-gray-500 mb-4">
                This will cancel all pending payments and close the session.
                This action cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCloseSession}
                  className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600"
                >
                  Close Session
                </button>
                <button
                  onClick={() => setShowCloseConfirm(false)}
                  className="flex-1 bg-gray-100 py-2 rounded-lg hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
