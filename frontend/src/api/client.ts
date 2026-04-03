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
  };

  if (opts.token) {
    headers["Authorization"] = `Bearer ${opts.token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiError(res.status, data.detail || "Unknown error");
  }

  return res.json();
}

// ── Session endpoints ───────────────────────────────────────────────────────

export type SessionResponse = {
  id: string;
  name: string;
  blinds_info: string;
  buy_in_amount: number;
  rebuy_amount: number;
  allow_rebuys: boolean;
  status: string;
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

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ access_token: string; token_type: string }>("/admin/login", {
      method: "POST",
      body: { username, password },
    }),

  // Sessions
  createSession: (data: Record<string, unknown>, token: string) =>
    request<SessionResponse>("/sessions", {
      method: "POST",
      body: data,
      token,
    }),

  listSessions: (token: string, limit = 20, offset = 0) =>
    request<SessionListResponse>(
      `/sessions?limit=${limit}&offset=${offset}`,
      { token },
    ),

  getSession: (id: string) =>
    request<SessionDetailResponse>(`/sessions/${id}`),

  closeSession: (id: string, token: string) =>
    request<Record<string, unknown>>(`/admin/sessions/${id}/close`, {
      method: "POST",
      token,
    }),

  // Player join
  joinSession: (sessionId: string, name: string, phone: string) =>
    request<{
      token: string;
      player_url: string;
      player: PlayerBrief;
      is_returning: boolean;
    }>(`/sessions/${sessionId}/join`, {
      method: "POST",
      body: { name, phone },
    }),

  // Player session
  getPlayerSession: (sessionId: string, playerToken: string) =>
    request<{
      id: string;
      session_id: string;
      session_name: string;
      player_name: string;
      status: string;
      total_chips_in: number;
      total_chips_out: number;
      transactions: TransactionData[];
    }>(`/sessions/${sessionId}/player/${playerToken}`),

  // Buy-in / Rebuy
  createBuyin: (sessionId: string, playerToken: string) =>
    request<{
      transaction_id: string;
      qr_code_base64: string;
      qr_code: string;
      amount: number;
      expires_at: string;
    }>(`/sessions/${sessionId}/player/${playerToken}/buyin`, {
      method: "POST",
    }),

  createRebuy: (sessionId: string, playerToken: string) =>
    request<{
      transaction_id: string;
      qr_code_base64: string;
      qr_code: string;
      amount: number;
      expires_at: string;
    }>(`/sessions/${sessionId}/player/${playerToken}/rebuy`, {
      method: "POST",
    }),

  // Admin actions
  markCashPayment: (
    sessionId: string,
    sessionPlayerId: string,
    token: string,
  ) =>
    request<Record<string, unknown>>(
      `/admin/sessions/${sessionId}/players/${sessionPlayerId}/cash`,
      { method: "POST", token },
    ),

  verifyPayment: (
    sessionId: string,
    sessionPlayerId: string,
    token: string,
  ) =>
    request<{
      mp_payment_id: string;
      mp_status: string;
      local_status: string;
      updated: boolean;
    }>(`/admin/sessions/${sessionId}/players/${sessionPlayerId}/verify`, {
      method: "POST",
      token,
    }),

  cashoutPlayer: (
    sessionId: string,
    sessionPlayerId: string,
    chipsReturned: number,
    token: string,
  ) =>
    request<Record<string, unknown>>(
      `/admin/sessions/${sessionId}/players/${sessionPlayerId}/cashout`,
      { method: "POST", body: { chips_returned: chipsReturned }, token },
    ),

  // Health
  health: () => request<{ status: string; database: string }>("/health"),
};

export { ApiError };
