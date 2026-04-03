import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function PlayerJoin() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [welcomeBack, setWelcomeBack] = useState("");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (name.trim().length < 2) {
      setError(pt.join.nameError);
      return;
    }

    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 11) {
      setError(pt.join.phoneError);
      return;
    }

    setLoading(true);
    try {
      const result = await api.joinSession(sessionId!, name.trim(), digits);

      if (result.is_returning) {
        setWelcomeBack(pt.join.welcomeBack(result.player.name));
        setTimeout(() => {
          navigate(`/session/${sessionId}/player/${result.token}`);
        }, 1500);
      } else {
        navigate(`/session/${sessionId}/player/${result.token}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else {
        setError(pt.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (welcomeBack) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
          <div className="text-4xl mb-4">👋</div>
          <p className="text-xl font-semibold text-gray-800">{welcomeBack}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          {pt.join.title}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {pt.join.nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={pt.join.namePlaceholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-poker-green focus:border-transparent outline-none"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {pt.join.phoneLabel}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder={pt.join.phonePlaceholder}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-poker-green focus:border-transparent outline-none"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-poker-green text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? pt.loading : pt.join.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
