import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

type HistoryData = {
  player: { id: string; name: string; phone: string };
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

export default function PlayerHistory() {
  const { clubId, sessionId, token } = useParams<{
    clubId: string;
    sessionId: string;
    token: string;
  }>();

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!clubId || !sessionId || !token) return;
    try {
      const result = await api.getPlayerHistory(clubId, sessionId, token);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, [clubId, sessionId, token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">{pt.loading}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <p className="text-gray-600">{error || "Histórico não disponível"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-xl font-bold text-gray-800">{data.player.name}</h1>
          <p className="text-sm text-gray-500">Histórico de sessões</p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-800">
                {data.total_sessions}
              </p>
              <p className="text-xs text-gray-500">Sessões</p>
            </div>
            <div className="text-center">
              <p
                className={`text-2xl font-bold ${data.total_net >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {data.total_net >= 0 ? "+" : ""}
                {data.total_net}
              </p>
              <p className="text-xs text-gray-500">Saldo de Fichas</p>
            </div>
          </div>
        </div>

        {/* Session list */}
        {data.items.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <p className="text-gray-400">Nenhuma sessão ainda</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Sessões</h3>
            <div className="space-y-3">
              {data.items.map((item) => (
                <div
                  key={item.session_id}
                  className="border-b border-gray-100 pb-3 last:border-0"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium text-gray-800 text-sm">
                        {item.session_name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(item.session_date).toLocaleDateString("pt-BR")}
                        {item.rebuy_count > 0 && ` · ${item.rebuy_count} rebuy(s)`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-bold text-sm ${
                          item.net_result >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {item.net_result >= 0 ? "+" : ""}
                        {item.net_result}
                      </p>
                      <p className="text-xs text-gray-400">
                        {pt.currency(item.total_buyin)} investidos
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="text-center">
          <button
            onClick={() => window.history.back()}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
