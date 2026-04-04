import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "react-qr-code";
import { api, ApiError } from "@/api/client";
import { usePlayerSession } from "@/hooks/useSession";
import { useWebSocket, WSEvent } from "@/hooks/useWebSocket";
import { pt } from "@/strings";

type PixData = {
  transaction_id: string;
  qr_code: string;
  qr_code_base64: string;
  amount: number;
  expires_at: string;
};

export default function PlayerSession() {
  const { clubId, sessionId, token } = useParams<{
    clubId: string;
    sessionId: string;
    token: string;
  }>();

  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixLoading, setPixLoading] = useState(false);
  const [pixError, setPixError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownData, setBreakdownData] = useState<{
    items: { label: string; color: string | null; count: number }[];
    totalCount: number;
    totalValue: number;
  } | null>(null);

  // Poll every 5s when showing a QR code (waiting for payment)
  const shouldPoll = !!pixData;
  const { data, isLoading, error, refetch } = usePlayerSession(
    clubId,
    sessionId,
    token,
    shouldPoll ? 5000 : undefined,
  );

  // WebSocket for real-time updates
  const { connected } = useWebSocket({
    sessionId,
    onEvent: useCallback(
      (event: WSEvent) => {
        if (event.event === "payment_confirmed" || event.event === "player_cashed_out") {
          refetch();
          if (event.event === "payment_confirmed") {
            setPixData(null);
          }
        }
        if (event.event === "session_closed") {
          setSessionClosed(true);
        }
      },
      [refetch],
    ),
  });

  // Clear QR when player becomes active and QR is showing
  useEffect(() => {
    if (data?.status === "active" && pixData) {
      setPixData(null);
    }
  }, [data?.status, pixData]);

  const handleBuyin = async () => {
    if (!clubId || !sessionId || !token) return;
    setPixLoading(true);
    setPixError("");
    try {
      const result = await api.createBuyin(clubId, sessionId, token);
      setPixData(result);
    } catch (err) {
      setPixError(
        err instanceof ApiError ? err.detail : pt.player.paymentUnavailable,
      );
    } finally {
      setPixLoading(false);
    }
  };

  const handleRebuy = async () => {
    if (!clubId || !sessionId || !token) return;
    setPixLoading(true);
    setPixError("");
    try {
      const result = await api.createRebuy(clubId, sessionId, token);
      setPixData(result);
    } catch (err) {
      setPixError(
        err instanceof ApiError ? err.detail : pt.player.paymentUnavailable,
      );
    } finally {
      setPixLoading(false);
    }
  };

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Check if QR is expired
  const isExpired = pixData
    ? new Date(pixData.expires_at) < new Date()
    : false;

  if (isLoading) {
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
          <p className="text-gray-600">{pt.player.invalidLink}</p>
        </div>
      </div>
    );
  }

  const statusColor = {
    waiting_payment: "bg-yellow-100 text-yellow-800",
    active: "bg-green-100 text-green-800",
    cashed_out: "bg-gray-100 text-gray-800",
  }[data.status] ?? "bg-gray-100 text-gray-800";

  const confirmedRebuyTotal = data.transactions
    .filter((t) => t.type === "rebuy" && t.status === "confirmed")
    .reduce((acc, t) => acc + t.amount, 0);

  const fetchBreakdown = async () => {
    if (!clubId || !data) return;
    setShowBreakdown(true);
    setLoadingBreakdown(true);
    try {
      const res = await api.getChipBreakdown(clubId, data.total_chips_in, "");
      setBreakdownData({
        items: res.items,
        totalCount: res.total_chips_count,
        totalValue: res.total_value,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBreakdown(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-sm mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-xl font-bold text-gray-800">
            {data.player_name}
          </h1>
          <p className="text-sm text-gray-500">{data.session_name}</p>
          <span
            className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}
          >
            {pt.status[data.status as keyof typeof pt.status] ?? data.status}
          </span>
          {!connected && (
            <p className="text-xs text-orange-500 mt-1">{pt.tv.reconnecting}</p>
          )}
        </div>

        {/* Session closed banner */}
        {sessionClosed && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <p className="text-blue-800 font-medium">
              {pt.player.sessionClosed}
            </p>
          </div>
        )}

        {/* Pix QR Display */}
        {pixData && !isExpired && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">
              {pt.player.pixTitle}
            </h2>
            <div className="flex justify-center mb-4">
              <QRCode value={pixData.qr_code} size={250} />
            </div>
            <p className="text-xs text-gray-400 mb-3">
              {pt.player.waitingPayment}
            </p>
            <div className="relative">
              <input
                type="text"
                readOnly
                value={pixData.qr_code}
                className="w-full px-3 py-2 text-xs border rounded-lg bg-gray-50 pr-20"
              />
              <button
                onClick={() => handleCopy(pixData.qr_code)}
                className="absolute right-1 top-1 px-3 py-1 bg-poker-green text-white text-xs rounded-md"
              >
                {copied ? pt.player.copied : pt.player.copyCode}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {pt.currency(pixData.amount)}
            </p>
          </div>
        )}

        {/* Expired QR */}
        {pixData && isExpired && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <p className="text-red-600 font-medium mb-3">
              {pt.player.paymentExpired}
            </p>
            <button
              onClick={data.status === "active" ? handleRebuy : handleBuyin}
              className="bg-poker-green text-white font-semibold py-2 px-6 rounded-lg"
            >
              {pt.player.generateNew}
            </button>
          </div>
        )}

        {/* Active state — show chip info + rebuy */}
        {data.status === "active" && !pixData && !sessionClosed && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center">
                <p className="text-xl font-bold text-gray-800">
                  {pt.currency(data.total_chips_in - confirmedRebuyTotal)}
                </p>
                <p className="text-xs text-gray-500 uppercase font-semibold">{pt.player.chipsIn}</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-gray-800">
                  {pt.currency(confirmedRebuyTotal)}
                </p>
                <p className="text-xs text-gray-500 uppercase font-semibold">{pt.player.rebuys}</p>
              </div>
            </div>

            <button
              onClick={fetchBreakdown}
              className="w-full mb-3 bg-gray-100 text-gray-700 font-semibold py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              🔍 {pt.player.verifyChips}
            </button>

            <button
              onClick={handleRebuy}
              disabled={pixLoading}
              className="w-full bg-poker-gold text-white font-semibold py-3 rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50"
            >
              {pixLoading ? pt.loading : pt.player.rebuyButton}
            </button>
          </div>
        )}

        {/* Waiting payment — trigger buy-in */}
        {data.status === "waiting_payment" && !pixData && !sessionClosed && (
          <div className="bg-white rounded-2xl shadow-lg p-6 text-center">
            <button
              onClick={handleBuyin}
              disabled={pixLoading}
              className="w-full bg-poker-green text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {pixLoading ? pt.loading : `Buy-in`}
            </button>
          </div>
        )}

        {pixError && (
          <p className="text-red-600 text-sm text-center">{pixError}</p>
        )}

        {/* History link */}
        <div className="text-center">
          <a
            href={`/history/${clubId}/${sessionId}/${token}`}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Ver meu desempenho geral
          </a>
        </div>

        {/* Transaction history */}
        {data.transactions.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {pt.player.transactionHistory}
            </h3>
            <div className="space-y-2">
              {data.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex justify-between text-sm border-b border-gray-100 pb-2"
                >
                  <span className="text-gray-700">
                    {pt.txType[tx.type as keyof typeof pt.txType] ?? tx.type}
                    {tx.amount > 0 && ` ${pt.currency(tx.amount)}`}
                  </span>
                  <span
                    className={
                      tx.status === "confirmed"
                        ? "text-green-600"
                        : tx.status === "pending"
                          ? "text-yellow-600"
                          : "text-gray-400"
                    }
                  >
                    {tx.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Breakdown Modal */}
        {showBreakdown && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-sm w-full">
              <div className="flex justify-between items-center border-b pb-4 mb-4">
                <h3 className="text-lg font-bold">{pt.player.verifyChips}</h3>
                <button
                  onClick={() => setShowBreakdown(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>

              {loadingBreakdown ? (
                <div className="text-center py-6 text-gray-500">{pt.loading}</div>
              ) : breakdownData ? (
                <>
                  <div className="text-center mb-4">
                    <p className="text-xs text-gray-500 uppercase">{pt.player.totalChipsCount}</p>
                    <p className="text-2xl font-bold text-gray-800">{breakdownData.totalCount}</p>
                  </div>

                  <div className="space-y-2 bg-gray-50 rounded-xl p-4">
                    {breakdownData.items.map((it, i) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full border" 
                            style={{ backgroundColor: it.color || "#ccc" }} 
                          />
                          <span className="font-medium">{it.label}</span>
                        </div>
                        <span className="text-gray-600">{it.count}x</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center py-4 text-red-500 text-sm">{pt.error}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
