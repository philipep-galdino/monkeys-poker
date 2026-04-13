import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, SessionDetailResponse } from "@/api/client";
import { useAppMode } from "@/hooks/useAppMode";
import { pt } from "@/strings";

export default function SessionDetail() {
  const { clubId, sessionId } = useParams<{ clubId: string; sessionId: string }>();
  const navigate = useNavigate();
  const { basePath } = useAppMode(clubId);

  const [session, setSession] = useState<SessionDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clubId || !sessionId) return;
    try {
      const detail = await api.getSession(clubId, sessionId);
      setSession(detail);
    } catch (err) {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [clubId, sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">{pt.loading}</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">Sessão não encontrada</p>
      </div>
    );
  }

  const confirmedTxs = session.session_players.flatMap((sp) =>
    sp.transactions.filter((t) => t.status === "confirmed" && t.type !== "cash_out"),
  );
  const totalPix = confirmedTxs
    .filter((t) => t.payment_method === "pix")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCash = confirmedTxs
    .filter((t) => t.payment_method === "cash")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalChipsIn = session.session_players.reduce((s, sp) => s + sp.total_chips_in, 0);
  const totalChipsOut = session.session_players.reduce((s, sp) => s + sp.total_chips_out, 0);

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`${basePath}/history`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Histórico
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{session.name}</h1>
            <p className="text-sm text-gray-500">
              {new Date(session.created_at).toLocaleDateString("pt-BR")} &middot;
              Blind {pt.currency(parseFloat(session.blinds_info) || 0)} &middot;{" "}
              <span
                className={
                  session.status === "open" ? "text-green-600" : "text-gray-400"
                }
              >
                {session.status === "open" ? "ABERTA" : "ENCERRADA"}
              </span>
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold">{session.session_players.length}</p>
            <p className="text-xs text-gray-500">Jogadores</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold">{totalChipsIn}</p>
            <p className="text-xs text-gray-500">Fichas In</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold">{pt.currency(totalPix)}</p>
            <p className="text-xs text-gray-500">Pix</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold">{pt.currency(totalCash)}</p>
            <p className="text-xs text-gray-500">Dinheiro</p>
          </div>
        </div>

        {/* Discrepancy */}
        {session.status === "closed" && totalChipsIn !== totalChipsOut && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-yellow-700 text-sm">
            Discrepância: {Math.abs(totalChipsIn - totalChipsOut)} fichas
            ({totalChipsIn} in, {totalChipsOut} out)
          </div>
        )}

        {/* Player table */}
        <div className="bg-white rounded-xl shadow-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500 bg-gray-50">
                <th className="py-3 px-4">Jogador</th>
                <th className="py-3 px-4">Telefone</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Fichas In</th>
                <th className="py-3 px-4 text-right">Fichas Out</th>
                <th className="py-3 px-4 text-right">Transações</th>
              </tr>
            </thead>
            <tbody>
              {session.session_players.map((sp) => (
                <tr key={sp.id} className="border-b">
                  <td className="py-3 px-4 font-medium">{sp.player.name}</td>
                  <td className="py-3 px-4 text-gray-500">{sp.player.phone}</td>
                  <td className="py-3 px-4 text-center">
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
                  <td className="py-3 px-4 text-right">{sp.total_chips_in}</td>
                  <td className="py-3 px-4 text-right">{sp.total_chips_out}</td>
                  <td className="py-3 px-4 text-right">
                    {sp.transactions.filter((t) => t.status === "confirmed").length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
