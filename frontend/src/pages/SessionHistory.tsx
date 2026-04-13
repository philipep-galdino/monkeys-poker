import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, SessionResponse } from "@/api/client";
import { useAppMode } from "@/hooks/useAppMode";
import { pt } from "@/strings";

export default function SessionHistory() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";
  const { basePath, loginPath } = useAppMode(clubId);

  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const limit = 20;

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const result = await api.listSessions(clubId, token, limit, page * limit);
      setSessions(result.items);
      setTotal(result.total);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate(loginPath);
      }
    } finally {
      setLoading(false);
    }
  }, [clubId, token, page, navigate, loginPath]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.ceil(total / limit);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">{pt.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(basePath)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Painel
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Histórico de Sessões</h1>
          <span className="text-sm text-gray-400">{total} sessões</span>
        </div>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <p className="text-gray-400">Nenhuma sessão encontrada</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-md overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500 bg-gray-50">
                  <th className="py-3 px-4">Sessão</th>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-center">Jogadores</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Buy-in</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => navigate(`${basePath}/sessions/${s.id}`)}
                  >
                    <td className="py-3 px-4 font-medium">{s.name}</td>
                    <td className="py-3 px-4 text-gray-500">
                      {new Date(s.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="py-3 px-4 text-center">{s.player_count}</td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          s.status === "open"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {s.status === "open" ? "ABERTA" : "FECHADA"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {pt.currency(s.buy_in_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-4 border-t">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 rounded text-sm border disabled:opacity-30"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-500">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1 rounded text-sm border disabled:opacity-30"
                >
                  Próxima
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
