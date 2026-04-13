import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useClubTheme } from "@/hooks/useClubTheme";
import PoweredBy from "@/components/PoweredBy";
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

  const theme = useClubTheme(clubId);
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
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.bg_color }}>
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-t-transparent" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: theme.bg_color }}>
        <div className="ck-card rounded-2xl p-8 text-center max-w-sm w-full border border-white/10">
          <p className="text-gray-400">{error || "Historico nao disponivel"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: theme.bg_color, color: theme.text_color, fontFamily: theme.font_family }}>
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="ck-card rounded-2xl border border-white/10 p-6">
          <h1 className="text-xl font-bold text-gray-100">{data.player.name}</h1>
          <p className="text-sm text-gray-500">Historico de sessoes</p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-100">{data.total_sessions}</p>
              <p className="text-xs text-gray-500">Sessoes</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${data.total_net >= 0 ? "text-green-400" : "text-red-400"}`}>
                {data.total_net >= 0 ? "+" : ""}{pt.currency(data.total_net)}
              </p>
              <p className="text-xs text-gray-500">Saldo Geral</p>
            </div>
          </div>
        </div>

        {/* Session list */}
        {data.items.length === 0 ? (
          <div className="ck-card rounded-2xl border border-white/10 p-6 text-center">
            <p className="text-gray-500">Nenhuma sessao ainda</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.items.map((item) => (
              <div
                key={item.session_id}
                className="ck-card rounded-xl border border-white/5 p-4"
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

        {/* Back link */}
        <div className="text-center">
          <button
            onClick={() => window.history.back()}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
          >
            &larr; Voltar
          </button>
        </div>
        <PoweredBy color={theme.text_color} />
      </div>
    </div>
  );
}
