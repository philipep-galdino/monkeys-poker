const BASE = "/api";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Pinggy-No-Screen": "true",
    "ngrok-skip-browser-warning": "true",
  };

  if (opts.token) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Sem conexão com o servidor. Verifique sua internet e tente novamente.");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new ApiError(res.status, typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail));
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(res.status, "Resposta inesperada do servidor. Tente novamente.");
  }
}

// ── Club types ──────────────────────────────────────────────────────────────

export type ClubResponse = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  default_rake_buyin: number;
  default_rake_rebuy: number;
  allow_multiple_buyins: boolean;
  created_at: string;
};

export type ClubListResponse = {
  items: ClubResponse[];
  total: number;
};

// ── Session types ───────────────────────────────────────────────────────────

export type ChipKitItem = {
  value: number;
  label: string;
  color: string | null;
  count: number;
};

export type ChipKit = {
  items: ChipKitItem[];
  total_value: number;
  total_chips_count: number;
  remainder: number;
};

export type SessionResponse = {
  id: string;
  club_id: string;
  name: string;
  blinds_info: string;
  buy_in_amount: number;
  rebuy_amount: number;
  allow_rebuys: boolean;
  rake_buyin: number;
  rake_rebuy: number;
  status: string;
  table_limit: number | null;
  buyin_kit: ChipKit | null;
  rebuy_kit: ChipKit | null;
  created_at: string;
  closed_at: string | null;
  player_count: number;
};

export type PlayerBrief = {
  id: string;
  name: string;
  phone: string;
};

export type TransactionData = {
  id: string;
  type: string;
  amount: number;
  chip_count: number;
  rake_amount: number;
  payment_method: string | null;
  status: string;
  created_at: string;
};

export type SessionPlayerData = {
  id: string;
  player: PlayerBrief;
  token: string;
  status: string;
  total_chips_in: number;
  total_physical_chips: number;
  total_chips_out: number;
  joined_at: string;
  transactions: TransactionData[];
};

export type SessionDetailResponse = SessionResponse & {
  session_players: SessionPlayerData[];
};

export type SessionListResponse = {
  items: SessionResponse[];
  total: number;
};

export type ChipDenominationData = {
  id: string;
  label: string;
  value: number;
  quantity: number;
  color: string | null;
  active: boolean;
  sort_order: number;
};

export type ChipBreakdownData = {
  items: { value: number; label: string; color: string | null; count: number }[];
  total_value: number;
  total_chips_count: number;
  remainder: number;
};

export type ClosePreviewResponse = {
  session_id: string;
  uncashed_players: { id: string; name: string; total_chips_in: number; total_physical_chips: number }[];
};

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/admin/login", {
      method: "POST",
      body: { username, password },
    }),

  // Clubs
  createClub: (data: Record<string, unknown>, token: string) =>
    request<ClubResponse>("/clubs", {
      method: "POST",
      body: data,
      token,
    }),

  listClubs: (token: string) =>
    request<ClubListResponse>("/clubs", { token }),

  getClub: (clubId: string, token: string) =>
    request<ClubResponse>(`/clubs/${clubId}`, { token }),

  updateClub: (clubId: string, data: Record<string, unknown>, token: string) =>
    request<ClubResponse>(`/clubs/${clubId}`, {
      method: "PUT",
      body: data,
      token,
    }),

  // Sessions (club-scoped)
  createSession: (clubId: string, data: Record<string, unknown>, token: string) =>
    request<SessionResponse>(`/clubs/${clubId}/sessions`, {
      method: "POST",
      body: data,
      token,
    }),

  listSessions: (clubId: string, token: string, limit = 20, offset = 0, status?: string) =>
    request<SessionListResponse>(
      `/clubs/${clubId}/sessions?limit=${limit}&offset=${offset}${status ? `&status_filter=${status}` : ""}`,
      { token },
    ),

  getSession: (clubId: string, id: string) =>
    request<SessionDetailResponse>(`/clubs/${clubId}/sessions/${id}`),

  closePreview: (clubId: string, id: string, token: string) =>
    request<ClosePreviewResponse>(`/admin/clubs/${clubId}/sessions/${id}/close-preview`, {
      token,
    }),

  closeSession: (clubId: string, id: string, token: string, force = false) =>
    request<Record<string, unknown>>(`/admin/clubs/${clubId}/sessions/${id}/close`, {
      method: "POST",
      body: { force },
      token,
    }),

  // Player join (club-scoped)
  joinSession: (clubId: string, sessionId: string, name: string, phone: string, cash_buy_ins: number = 0) =>
    request<{
      token: string;
      player_url: string;
      player: PlayerBrief;
      is_returning: boolean;
    }>(`/clubs/${clubId}/sessions/${sessionId}/join`, {
      method: "POST",
      body: { name, phone, cash_buy_ins },
    }),

  // Player session (club-scoped)
  getPlayerSession: (clubId: string, sessionId: string, playerToken: string) =>
    request<{
      id: string;
      session_id: string;
      session_name: string;
      player_name: string;
      status: string;
      total_chips_in: number;
      total_physical_chips: number;
      total_chips_out: number;
      blind_value: number;
      blinds_count: number;
      transactions: TransactionData[];
    }>(`/clubs/${clubId}/sessions/${sessionId}/player/${playerToken}`),

  // Buy-in / Rebuy (club-scoped)
  createBuyin: (clubId: string, sessionId: string, playerToken: string) =>
    request<{
      transaction_id: string;
      qr_code_base64: string;
      qr_code: string;
      amount: number;
      expires_at: string;
    }>(`/clubs/${clubId}/sessions/${sessionId}/player/${playerToken}/buyin`, {
      method: "POST",
    }),

  createRebuy: (clubId: string, sessionId: string, playerToken: string) =>
    request<{
      transaction_id: string;
      qr_code_base64: string;
      qr_code: string;
      amount: number;
      expires_at: string;
    }>(`/clubs/${clubId}/sessions/${sessionId}/player/${playerToken}/rebuy`, {
      method: "POST",
    }),

  // Admin actions (club-scoped)
  markCashPayment: (
    clubId: string,
    sessionId: string,
    sessionPlayerId: string,
    token: string,
  ) =>
    request<Record<string, unknown>>(
      `/admin/clubs/${clubId}/sessions/${sessionId}/players/${sessionPlayerId}/cash`,
      { method: "POST", token },
    ),

  rebuyCash: (
    clubId: string,
    sessionId: string,
    sessionPlayerId: string,
    token: string,
  ) =>
    request<{ transaction_id: string; status: string; amount: number; chip_count: number }>(
      `/admin/clubs/${clubId}/sessions/${sessionId}/players/${sessionPlayerId}/rebuy-cash`,
      { method: "POST", token },
    ),

  verifyPayment: (
    clubId: string,
    sessionId: string,
    sessionPlayerId: string,
    token: string,
  ) =>
    request<{
      mp_payment_id: string;
      mp_status: string;
      local_status: string;
      updated: boolean;
    }>(`/admin/clubs/${clubId}/sessions/${sessionId}/players/${sessionPlayerId}/verify`, {
      method: "POST",
      token,
    }),

  cashoutPlayer: (
    clubId: string,
    sessionId: string,
    sessionPlayerId: string,
    chipsReturned: number,
    token: string,
  ) =>
    request<Record<string, unknown>>(
      `/admin/clubs/${clubId}/sessions/${sessionId}/players/${sessionPlayerId}/cashout`,
      { method: "POST", body: { chips_returned: chipsReturned }, token },
    ),

  // Player history
  getAdminPlayerHistory: (clubId: string, playerId: string, token: string) =>
    request<{
      player: PlayerBrief;
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
    }>(`/admin/clubs/${clubId}/players/${playerId}/history`, { token }),

  getPlayerHistory: (clubId: string, sessionId: string, playerToken: string) =>
    request<{
      player: PlayerBrief;
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
    }>(`/clubs/${clubId}/sessions/${sessionId}/player/${playerToken}/history`),

  // Chip denominations
  getChipDenominations: (clubId: string, token: string) =>
    request<ChipDenominationData[]>(`/clubs/${clubId}/chip-denominations`, { token }),

  setChipDenominations: (
    clubId: string,
    items: Omit<ChipDenominationData, "id">[],
    token: string,
  ) =>
    request<ChipDenominationData[]>(`/clubs/${clubId}/chip-denominations`, {
      method: "PUT",
      body: items,
      token,
    }),

  getChipBreakdown: (
    clubId: string,
    amount: number,
    token: string,
    params?: { exclude?: string; blinds_info?: string; table_limit?: number },
  ) => {
    let url = `/clubs/${clubId}/chip-breakdown?amount=${amount}`;
    if (params?.exclude) url += `&exclude=${params.exclude}`;
    if (params?.blinds_info) url += `&blinds_info=${encodeURIComponent(params.blinds_info)}`;
    if (params?.table_limit) url += `&table_limit=${params.table_limit}`;
    return request<ChipBreakdownData>(url, { token });
  },

  // Health
  health: () => request<{ status: string; database: string }>("/health"),
};

export { ApiError };
