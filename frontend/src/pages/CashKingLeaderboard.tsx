import type { CSSProperties } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  api,
  ApiError,
  CashKingLeaderboardEntry,
  CashKingScoreData,
  PlayerBrief,
} from "@/api/client";
import { useWebSocket, type WSEvent } from "@/hooks/useWebSocket";
import { useAppMode } from "@/hooks/useAppMode";
import { useClubTheme } from "@/hooks/useClubTheme";
import { pt } from "@/strings";

/* ── Helpers ──────────────────────────────────────────────────── */

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const months = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function scoreLabel(s: CashKingScoreData): string {
  if (s.session_name) return s.session_name;
  if (s.description) return s.description;
  return pt.cashKing.manual;
}

const Crown = ({ size = 28, className = "", style }: { size?: number; className?: string; style?: CSSProperties }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className={className} style={style}>
    <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
  </svg>
);

const PlusIcon = ({ size = 18, className = "" }: { size?: number; className?: string }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const medalColors: Record<number, { text: string; bg: string; border: string; row: string }> = {
  0: { text: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30", row: "ck-row-gold" },
  1: { text: "text-gray-300", bg: "bg-gray-300/10", border: "border-gray-300/30", row: "ck-row-silver" },
  2: { text: "text-amber-600", bg: "bg-amber-600/10", border: "border-amber-600/30", row: "ck-row-bronze" },
};

/* ── Component ────────────────────────────────────────────────── */

export default function CashKingLeaderboard() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";
  const isAdmin = !!token;
  const { basePath } = useAppMode(clubId);
  const theme = useClubTheme(clubId);

  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [entries, setEntries] = useState<CashKingLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [playerScores, setPlayerScores] = useState<CashKingScoreData[]>([]);
  const [loadingScores, setLoadingScores] = useState(false);

  // Edit score modal
  const [editScore, setEditScore] = useState<CashKingScoreData | null>(null);
  const [editForm, setEditForm] = useState({
    attendance_pts: "", hours_pts: "", croupier_pts: "", profit_pts: "", manual_adj: "",
  });
  const [saving, setSaving] = useState(false);

  // Add player modal
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [searchResults, setSearchResults] = useState<PlayerBrief[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerBrief | null>(null);
  const [addForm, setAddForm] = useState({
    description: "",
    attendance_pts: "0", hours_pts: "0", croupier_pts: "0", profit_pts: "0", manual_adj: "0",
  });
  const [addSaving, setAddSaving] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<CashKingScoreData | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Track open session id for real-time updates
  const [openSessionId, setOpenSessionId] = useState<string | undefined>();

  const loadLeaderboard = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.getCashKingLeaderboard(clubId, yearMonth);
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erro ao carregar ranking");
    } finally {
      setLoading(false);
    }
  }, [clubId, yearMonth]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  // Fetch the club's open session (if any) to enable WS subscription
  useEffect(() => {
    if (!clubId || !token) return;
    let cancelled = false;
    api
      .listSessions(clubId, token, 1, 0, "open")
      .then((res) => {
        if (cancelled) return;
        setOpenSessionId(res.items[0]?.id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clubId, token]);

  // Real-time refresh when a player cashes out
  useWebSocket({
    sessionId: openSessionId,
    onEvent: useCallback(
      (evt: WSEvent) => {
        if (evt.event === "player_cashed_out") {
          loadLeaderboard();
        }
      },
      [loadLeaderboard],
    ),
  });

  const reloadExpanded = useCallback(async () => {
    if (!clubId || !expandedPlayerId) return;
    const scores = await api.getCashKingPlayerScores(clubId, expandedPlayerId, yearMonth);
    setPlayerScores(scores);
  }, [clubId, expandedPlayerId, yearMonth]);

  const togglePlayer = async (playerId: string) => {
    if (expandedPlayerId === playerId) {
      setExpandedPlayerId(null);
      setPlayerScores([]);
      return;
    }
    if (!clubId) return;
    setExpandedPlayerId(playerId);
    setLoadingScores(true);
    try {
      const scores = await api.getCashKingPlayerScores(clubId, playerId, yearMonth);
      setPlayerScores(scores);
    } catch { setPlayerScores([]); }
    finally { setLoadingScores(false); }
  };

  /* ── Edit handlers ───────────────────────────────── */
  const openEdit = (score: CashKingScoreData) => {
    setEditScore(score);
    setEditForm({
      attendance_pts: String(score.attendance_pts),
      hours_pts: String(score.hours_pts),
      croupier_pts: String(score.croupier_pts),
      profit_pts: String(score.profit_pts),
      manual_adj: String(score.manual_adj),
    });
  };

  const handleSaveEdit = async () => {
    if (!editScore || !clubId) return;
    setSaving(true);
    try {
      await api.editCashKingScore(clubId, editScore.id, {
        attendance_pts: parseFloat(editForm.attendance_pts),
        hours_pts: parseFloat(editForm.hours_pts),
        croupier_pts: parseFloat(editForm.croupier_pts),
        profit_pts: parseFloat(editForm.profit_pts),
        manual_adj: parseFloat(editForm.manual_adj),
      }, token);
      setEditScore(null);
      await loadLeaderboard();
      await reloadExpanded();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  /* ── Delete handler ──────────────────────────────── */
  const handleDelete = async () => {
    if (!deleteTarget || !clubId) return;
    setDeleting(true);
    try {
      await api.deleteCashKingScore(clubId, deleteTarget.id, token);
      setDeleteTarget(null);
      await loadLeaderboard();
      await reloadExpanded();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erro ao remover");
    } finally { setDeleting(false); }
  };

  /* ── Add player handlers ─────────────────────────── */
  const handlePlayerSearch = (q: string) => {
    setPlayerSearch(q);
    setSelectedPlayer(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!q.trim() || !clubId) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await api.listClubPlayers(clubId, token, q.trim());
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 300);
  };

  const handleAddScore = async () => {
    if (!selectedPlayer || !clubId) return;
    setAddSaving(true);
    try {
      await api.createCashKingScore(clubId, {
        player_id: selectedPlayer.id,
        year_month: yearMonth,
        description: addForm.description || null,
        attendance_pts: parseFloat(addForm.attendance_pts) || 0,
        hours_pts: parseFloat(addForm.hours_pts) || 0,
        croupier_pts: parseFloat(addForm.croupier_pts) || 0,
        profit_pts: parseFloat(addForm.profit_pts) || 0,
        manual_adj: parseFloat(addForm.manual_adj) || 0,
      }, token);
      setShowAddPlayer(false);
      resetAddForm();
      await loadLeaderboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : "Erro ao adicionar");
    } finally { setAddSaving(false); }
  };

  const resetAddForm = () => {
    setPlayerSearch("");
    setSearchResults([]);
    setSelectedPlayer(null);
    setAddForm({ description: "", attendance_pts: "0", hours_pts: "0", croupier_pts: "0", profit_pts: "0", manual_adj: "0" });
  };

  const leader = entries[0];
  const maxPts = leader?.total_pts || 1;

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.bg_color, color: theme.text_color, fontFamily: theme.font_family }}>
      {/* Gradient header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${theme.primary_color}1a, ${theme.bg_color} 70%)` }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-yellow-500/5 blur-3xl" />

        <div className="relative max-w-2xl mx-auto px-4 pt-6 pb-4">
          <button
            onClick={() => navigate(isAdmin ? basePath : -1 as never)}
            className="text-gray-500 hover:text-gray-300 text-sm mb-4 inline-block transition-colors"
          >
            &larr; Voltar
          </button>

          <div className="text-center mb-6">
            <div className="inline-block animate-crown-pulse">
              <Crown size={48} className="mx-auto" style={{ color: theme.primary_color }} />
            </div>
            <h1 className="text-3xl font-extrabold shimmer-gold mt-2 tracking-tight" style={{ color: theme.primary_color }}>
              {pt.cashKing.title}
            </h1>
            <p className="text-gray-500 text-sm mt-1">{pt.cashKing.leaderboard}</p>
          </div>

          {/* Month selector + Add button */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <button
              onClick={() => setYearMonth(shiftMonth(yearMonth, -1))}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
            <span className="text-lg font-semibold text-gray-200 min-w-[180px] text-center">
              {monthLabel(yearMonth)}
            </span>
            <button
              onClick={() => setYearMonth(shiftMonth(yearMonth, 1))}
              className="w-10 h-10 rounded-full bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>

        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-12">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-4 text-red-400 text-sm text-center">
            {error}
            <button onClick={() => setError("")} className="ml-2 text-red-500 hover:text-red-300">&times;</button>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-t-transparent mb-3" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
            <p className="text-gray-500 text-sm">{pt.loading}</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <Crown size={56} className="text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500">{pt.cashKing.noEntries}</p>
            <p className="text-gray-600 text-sm mt-1">Crie sessoes com Rei do Cash ativado</p>
          </div>
        ) : (
          <>
            {/* Podium (top 3) */}
            {entries.length >= 3 && (
              <div className="flex items-end justify-center gap-3 mb-8 px-4">
                <PodiumCard entry={entries[1]} position={2} maxPts={maxPts} onClick={() => togglePlayer(entries[1].player.id)} />
                <PodiumCard entry={entries[0]} position={1} maxPts={maxPts} onClick={() => togglePlayer(entries[0].player.id)} />
                <PodiumCard entry={entries[2]} position={3} maxPts={maxPts} onClick={() => togglePlayer(entries[2].player.id)} />
              </div>
            )}

            {/* Expanded breakdown for podium players */}
            {entries.length >= 3 && entries.slice(0, 3).some(e => expandedPlayerId === e.player.id) && (
              <div className="mb-4 animate-fade-in-up rounded-xl overflow-hidden bg-white/[0.03]" style={{ border: `1px solid ${theme.primary_color}33` }}>
                <div className="px-4 pt-3 pb-1">
                  <p className="text-sm font-medium text-gray-400">
                    {entries.find(e => e.player.id === expandedPlayerId)?.player.name}
                  </p>
                </div>
                <BreakdownPanel loading={loadingScores} scores={playerScores} isAdmin={isAdmin} onEdit={openEdit} onDelete={setDeleteTarget} />
              </div>
            )}

            {/* Leaderboard rows */}
            <div className="space-y-2">
              {entries.map((entry, idx) => {
                if (entries.length >= 3 && idx < 3) return null;
                const medal = medalColors[idx];
                const pctBar = (entry.total_pts / maxPts) * 100;

                return (
                  <div
                    key={entry.player.id}
                    className={`animate-fade-in-up rounded-xl overflow-hidden border transition-all ${
                      expandedPlayerId === entry.player.id
                        ? "bg-white/[0.04]"
                        : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                    } ${medal?.row ?? ""}`}
                    style={{ animationDelay: `${idx * 50}ms`, ...(expandedPlayerId === entry.player.id ? { borderColor: `${theme.primary_color}4d` } : {}) }}
                  >
                    <button onClick={() => togglePlayer(entry.player.id)} className="w-full text-left p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          medal ? `${medal.bg} ${medal.text} border ${medal.border}` : "bg-white/5 text-gray-500 border border-white/10"
                        }`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-200 font-medium truncate">{entry.player.name}</p>
                          <div className="mt-1.5 h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pctBar}%`, background: `linear-gradient(to right, ${theme.primary_color}cc, ${theme.primary_color}80)` }} />
                          </div>
                        </div>
                        <div className="text-right pl-3">
                          <p className="text-lg font-bold" style={{ color: theme.primary_color }}>{entry.total_pts.toFixed(1)}</p>
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                            {entry.session_count} {entry.session_count === 1 ? "sessao" : "sessoes"}
                          </p>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                          className={`text-gray-600 transition-transform ${expandedPlayerId === entry.player.id ? "rotate-180" : ""}`}>
                          <path d="M6 9l6 6 6-6" strokeLinecap="round" />
                        </svg>
                      </div>
                    </button>
                    {expandedPlayerId === entry.player.id && (
                      <BreakdownPanel loading={loadingScores} scores={playerScores} isAdmin={isAdmin} onEdit={openEdit} onDelete={setDeleteTarget} />
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Add player button – subtle, bottom of page */}
      {isAdmin && (
        <div className="flex justify-center mt-2 mb-6">
          <button
            onClick={() => { resetAddForm(); setShowAddPlayer(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-gray-500 text-xs hover:text-gray-400 hover:bg-white/5 transition-all"
          >
            <PlusIcon size={12} />
            {pt.cashKing.addPlayer}
          </button>
        </div>
      )}

      {/* ── Edit score modal ───────────────────────── */}
      {editScore && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="ck-card rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl animate-fade-in-up">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={20} style={{ color: theme.primary_color }} />
              <h3 className="text-lg font-bold text-gray-200">{pt.cashKing.editScore}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              {editScore.player.name} &mdash; {scoreLabel(editScore)}
            </p>
            <div className="space-y-3">
              {([
                ["attendance_pts", pt.cashKing.attendance, "bg-green-500/20 text-green-400"],
                ["hours_pts", pt.cashKing.hours, "bg-blue-500/20 text-blue-400"],
                ["croupier_pts", pt.cashKing.croupier, "bg-purple-500/20 text-purple-400"],
                ["profit_pts", pt.cashKing.profit, "bg-yellow-500/20 text-yellow-400"],
                ["manual_adj", pt.cashKing.adjustment, "bg-gray-500/20 text-gray-400"],
              ] as const).map(([key, label, badge]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${badge} min-w-[70px] text-center`}>{label}</span>
                  <input type="number" step="0.1" value={editForm[key]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 focus:border-white/30 focus:outline-none transition-colors" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={handleSaveEdit} disabled={saving}
                className="flex-1 font-bold py-2.5 rounded-xl hover:brightness-110 text-sm disabled:opacity-50 transition-all" style={{ backgroundColor: theme.primary_color, color: theme.bg_color }}>
                {saving ? pt.loading : pt.cashKing.save}
              </button>
              <button onClick={() => setEditScore(null)}
                className="flex-1 bg-white/5 border border-white/10 text-gray-400 py-2.5 rounded-xl hover:bg-white/10 text-sm transition-all">
                {pt.cashKing.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation modal ──────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="ck-card rounded-2xl p-6 max-w-sm w-full border border-red-500/20 shadow-2xl animate-fade-in-up">
            <h3 className="text-lg font-bold text-gray-200 mb-2">{pt.cashKing.delete}</h3>
            <p className="text-sm text-gray-400 mb-1">{deleteTarget.player.name}</p>
            <p className="text-sm text-gray-500 mb-5">{scoreLabel(deleteTarget)} &mdash; {deleteTarget.total_pts.toFixed(1)} pts</p>
            <p className="text-sm text-red-400 mb-5">{pt.cashKing.deleteConfirm}</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 bg-red-500 text-white font-bold py-2.5 rounded-xl hover:bg-red-600 text-sm disabled:opacity-50 transition-all">
                {deleting ? pt.loading : pt.cashKing.delete}
              </button>
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 bg-white/5 border border-white/10 text-gray-400 py-2.5 rounded-xl hover:bg-white/10 text-sm transition-all">
                {pt.cashKing.cancel}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add player modal ───────────────────────── */}
      {showAddPlayer && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="ck-card rounded-2xl p-6 max-w-md w-full shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto" style={{ border: `1px solid ${theme.primary_color}33` }}>
            <div className="flex items-center gap-2 mb-1">
              <Crown size={20} style={{ color: theme.primary_color }} />
              <h3 className="text-lg font-bold text-gray-200">{pt.cashKing.addPlayer}</h3>
            </div>
            <p className="text-sm text-gray-500 mb-5">{pt.cashKing.addPlayerDesc}</p>

            {/* Player search */}
            {!selectedPlayer ? (
              <div className="mb-4">
                <input
                  type="text"
                  value={playerSearch}
                  onChange={(e) => handlePlayerSearch(e.target.value)}
                  placeholder={pt.cashKing.searchPlayer}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-200 placeholder-gray-600 focus:border-white/30 focus:outline-none transition-colors"
                  autoFocus
                />
                {searchLoading && (
                  <div className="text-center py-3">
                    <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-t-transparent" style={{ borderColor: theme.primary_color, borderTopColor: 'transparent' }} />
                  </div>
                )}
                {!searchLoading && playerSearch && searchResults.length === 0 && (
                  <p className="text-center text-gray-600 text-sm py-3">{pt.cashKing.noPlayersFound}</p>
                )}
                {searchResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                    {searchResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPlayer(p); setSearchResults([]); }}
                        className="w-full text-left px-3 py-2 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/5 transition-colors"
                      >
                        <span className="text-gray-200 text-sm font-medium">{p.name}</span>
                        <span className="text-gray-600 text-xs ml-2">{p.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="mb-4 flex items-center gap-3 p-3 rounded-xl" style={{ backgroundColor: `${theme.primary_color}0d`, border: `1px solid ${theme.primary_color}33` }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: `${theme.primary_color}1a` }}>
                  <span className="text-sm font-bold" style={{ color: theme.primary_color }}>
                    {selectedPlayer.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="text-gray-200 font-medium text-sm">{selectedPlayer.name}</p>
                  <p className="text-gray-500 text-xs">{selectedPlayer.phone}</p>
                </div>
                <button onClick={() => { setSelectedPlayer(null); setPlayerSearch(""); }}
                  className="text-gray-500 hover:text-gray-300 text-sm">&times;</button>
              </div>
            )}

            {selectedPlayer && (
              <>
                {/* Description */}
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-1">{pt.cashKing.descriptionLabel}</label>
                  <input
                    type="text"
                    value={addForm.description}
                    onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                    placeholder={pt.cashKing.descriptionPlaceholder}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 placeholder-gray-600 focus:border-white/30 focus:outline-none transition-colors"
                  />
                </div>

                {/* Point fields */}
                <div className="space-y-2.5 mb-5">
                  {([
                    ["attendance_pts", pt.cashKing.attendance, "bg-green-500/20 text-green-400"],
                    ["hours_pts", pt.cashKing.hours, "bg-blue-500/20 text-blue-400"],
                    ["croupier_pts", pt.cashKing.croupier, "bg-purple-500/20 text-purple-400"],
                    ["profit_pts", pt.cashKing.profit, "bg-yellow-500/20 text-yellow-400"],
                    ["manual_adj", pt.cashKing.adjustment, "bg-gray-500/20 text-gray-400"],
                  ] as const).map(([key, label, badge]) => (
                    <div key={key} className="flex items-center gap-3">
                      <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${badge} min-w-[70px] text-center`}>{label}</span>
                      <input type="number" step="0.1" value={addForm[key]}
                        onChange={(e) => setAddForm({ ...addForm, [key]: e.target.value })}
                        className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-200 focus:border-white/30 focus:outline-none transition-colors" />
                    </div>
                  ))}
                </div>

                {/* Total preview */}
                <div className="text-center mb-5 p-3 rounded-xl" style={{ backgroundColor: `${theme.primary_color}0d`, border: `1px solid ${theme.primary_color}1a` }}>
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">{pt.cashKing.total}</p>
                  <p className="text-2xl font-extrabold" style={{ color: theme.primary_color }}>
                    {(
                      (parseFloat(addForm.attendance_pts) || 0) +
                      (parseFloat(addForm.hours_pts) || 0) +
                      (parseFloat(addForm.croupier_pts) || 0) +
                      (parseFloat(addForm.profit_pts) || 0) +
                      (parseFloat(addForm.manual_adj) || 0)
                    ).toFixed(1)} <span className="text-sm font-medium text-gray-500">pts</span>
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={handleAddScore} disabled={addSaving}
                    className="flex-1 font-bold py-2.5 rounded-xl hover:brightness-110 text-sm disabled:opacity-50 transition-all" style={{ backgroundColor: theme.primary_color, color: theme.bg_color }}>
                    {addSaving ? pt.loading : pt.cashKing.addPlayer}
                  </button>
                  <button onClick={() => { setShowAddPlayer(false); resetAddForm(); }}
                    className="flex-1 bg-white/5 border border-white/10 text-gray-400 py-2.5 rounded-xl hover:bg-white/10 text-sm transition-all">
                    {pt.cashKing.cancel}
                  </button>
                </div>
              </>
            )}

            {!selectedPlayer && (
              <div className="flex justify-end">
                <button onClick={() => { setShowAddPlayer(false); resetAddForm(); }}
                  className="bg-white/5 border border-white/10 text-gray-400 px-4 py-2 rounded-xl hover:bg-white/10 text-sm transition-all">
                  {pt.cashKing.cancel}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Podium card ──────────────────────────────────────────────── */

function PodiumCard({
  entry, position, onClick,
}: {
  entry: CashKingLeaderboardEntry;
  position: 1 | 2 | 3;
  maxPts: number;
  onClick: () => void;
}) {
  const heights = { 1: "h-32", 2: "h-24", 3: "h-20" };
  const sizes = { 1: "w-20 h-20", 2: "w-16 h-16", 3: "w-16 h-16" };
  const colors = {
    1: { ring: "ring-yellow-400", text: "text-yellow-400", bg: "from-yellow-400/20 to-yellow-600/5", posText: "text-yellow-400" },
    2: { ring: "ring-gray-300", text: "text-gray-300", bg: "from-gray-300/15 to-gray-500/5", posText: "text-gray-300" },
    3: { ring: "ring-amber-600", text: "text-amber-600", bg: "from-amber-600/15 to-amber-800/5", posText: "text-amber-600" },
  };
  const c = colors[position];
  const order = { 1: "order-2", 2: "order-1", 3: "order-3" };
  const initials = entry.player.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <button onClick={onClick}
      className={`${order[position]} flex-1 max-w-[160px] group animate-fade-in-up`}
      style={{ animationDelay: position === 1 ? "0ms" : position === 2 ? "100ms" : "200ms" }}>
      <div className="flex flex-col items-center">
        {position === 1 && (
          <div className="animate-float mb-1">
            <Crown size={32} className="text-yellow-400 animate-crown-pulse" />
          </div>
        )}
        <div className={`${sizes[position]} rounded-full ${c.ring} ring-2 bg-gradient-to-br ${c.bg} flex items-center justify-center mb-2 group-hover:scale-105 transition-transform`}>
          <span className={`${position === 1 ? "text-lg" : "text-sm"} font-bold ${c.text}`}>{initials}</span>
        </div>
        <p className="text-gray-300 text-sm font-medium truncate w-full text-center mb-0.5">
          {entry.player.name.split(" ")[0]}
        </p>
        <p className={`text-xl font-extrabold ${c.text}`}>{entry.total_pts.toFixed(1)}</p>
        <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-2">pts</p>
        <div className={`${heights[position]} w-full rounded-t-xl bg-gradient-to-t ${c.bg} border-t border-x border-white/10 flex items-start justify-center pt-3`}>
          <span className={`text-2xl font-black ${c.posText} opacity-50`}>{position}</span>
        </div>
      </div>
    </button>
  );
}

/* ── Breakdown panel ──────────────────────────────────────────── */

function BreakdownPanel({
  loading, scores, isAdmin, onEdit, onDelete,
}: {
  loading: boolean;
  scores: CashKingScoreData[];
  isAdmin: boolean;
  onEdit: (s: CashKingScoreData) => void;
  onDelete: (s: CashKingScoreData) => void;
}) {
  if (loading) {
    return (
      <div className="px-4 py-4 text-center">
        <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-t-transparent" style={{ borderColor: 'var(--club-primary)', borderTopColor: 'transparent' }} />
      </div>
    );
  }
  if (scores.length === 0) {
    return <div className="px-4 py-4 text-center text-gray-600 text-sm">Sem detalhes disponiveis</div>;
  }

  return (
    <div className="px-4 pb-4">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-white/5">
              <th className="py-2 text-left font-medium">Sessao</th>
              <th className="py-2 text-right font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500/60 mr-1 align-middle" />Pres.
              </th>
              <th className="py-2 text-right font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500/60 mr-1 align-middle" />Hrs
              </th>
              <th className="py-2 text-right font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-500/60 mr-1 align-middle" />Crup.
              </th>
              <th className="py-2 text-right font-medium">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500/60 mr-1 align-middle" />Lucro
              </th>
              <th className="py-2 text-right font-medium">Adj</th>
              <th className="py-2 text-right font-bold" style={{ color: 'var(--club-primary)' }}>Total</th>
              {isAdmin && <th className="py-2 w-20" />}
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="py-2 text-gray-400 max-w-[120px] truncate">
                  {scoreLabel(s)}
                  {!s.session_name && (
                    <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-semibold" style={{ backgroundColor: 'color-mix(in srgb, var(--club-primary) 10%, transparent)', color: 'var(--club-primary)' }}>
                      {pt.cashKing.manual}
                    </span>
                  )}
                </td>
                <td className="py-2 text-right text-green-400/80">{s.attendance_pts.toFixed(1)}</td>
                <td className="py-2 text-right text-blue-400/80">{s.hours_pts.toFixed(1)}</td>
                <td className="py-2 text-right text-purple-400/80">{s.croupier_pts.toFixed(1)}</td>
                <td className="py-2 text-right text-yellow-400/80">{s.profit_pts.toFixed(1)}</td>
                <td className="py-2 text-right text-gray-500">
                  {s.manual_adj !== 0 ? (
                    <span className={s.manual_adj > 0 ? "text-green-400" : "text-red-400"}>
                      {s.manual_adj > 0 ? "+" : ""}{s.manual_adj.toFixed(1)}
                    </span>
                  ) : <span className="text-gray-600">&mdash;</span>}
                </td>
                <td className="py-2 text-right font-bold" style={{ color: 'var(--club-primary)' }}>{s.total_pts.toFixed(1)}</td>
                {isAdmin && (
                  <td className="py-2 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                        className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-gray-500 border border-white/10 rounded transition-all"
                        style={{ ['--hover-color' as string]: 'var(--club-primary)' }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--club-primary)'; (e.target as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--club-primary) 30%, transparent)'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.color = ''; (e.target as HTMLElement).style.borderColor = ''; }}>
                        Editar
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                        className="px-1.5 py-1 text-[10px] uppercase tracking-wider text-gray-500 hover:text-red-400 border border-white/10 rounded hover:border-red-500/30 transition-all">
                        &times;
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
