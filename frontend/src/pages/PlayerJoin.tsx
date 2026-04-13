import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { useClubTheme } from "@/hooks/useClubTheme";
import PoweredBy from "@/components/PoweredBy";
import { pt } from "@/strings";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function PlayerJoin() {
  const { clubId, sessionId } = useParams<{ clubId: string; sessionId: string }>();
  const navigate = useNavigate();
  const theme = useClubTheme(clubId);

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
      const result = await api.joinSession(clubId!, sessionId!, name.trim(), digits);

      if (result.is_returning) {
        setWelcomeBack(pt.join.welcomeBack(result.player.name));
        setTimeout(() => {
          navigate(`/session/${clubId}/${sessionId}/player/${result.token}`);
        }, 1500);
      } else {
        navigate(`/session/${clubId}/${sessionId}/player/${result.token}`);
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
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: theme.bg_color, fontFamily: theme.font_family }}
      >
        <div
          className="rounded-2xl shadow-lg p-8 text-center max-w-sm w-full"
          style={{ backgroundColor: `${theme.text_color}10`, border: `1px solid ${theme.text_color}20` }}
        >
          <div className="text-4xl mb-4">&#128075;</div>
          <p className="text-xl font-semibold" style={{ color: theme.text_color }}>
            {welcomeBack}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: theme.bg_color, fontFamily: theme.font_family }}
    >
      <div
        className="rounded-2xl shadow-lg p-8 max-w-sm w-full"
        style={{ backgroundColor: `${theme.text_color}08`, border: `1px solid ${theme.text_color}15` }}
      >
        {theme.logo_url && (
          <div className="flex justify-center mb-4">
            <img
              src={theme.logo_url}
              alt=""
              className="h-12 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        )}

        <h1
          className="text-2xl font-bold text-center mb-6"
          style={{ color: theme.primary_color }}
        >
          {pt.join.title}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: `${theme.text_color}bb` }}>
              {pt.join.nameLabel}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={pt.join.namePlaceholder}
              className="w-full px-4 py-3 rounded-lg outline-none transition-shadow"
              style={{
                backgroundColor: `${theme.text_color}10`,
                border: `1px solid ${theme.text_color}20`,
                color: theme.text_color,
              }}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: `${theme.text_color}bb` }}>
              {pt.join.phoneLabel}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder={pt.join.phonePlaceholder}
              className="w-full px-4 py-3 rounded-lg outline-none transition-shadow"
              style={{
                backgroundColor: `${theme.text_color}10`,
                border: `1px solid ${theme.text_color}20`,
                color: theme.text_color,
              }}
              required
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold py-3 rounded-lg transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: theme.accent_color, color: theme.text_color }}
          >
            {loading ? pt.loading : pt.join.submit}
          </button>
        </form>
      </div>
      <PoweredBy color={theme.text_color} />
    </div>
  );
}
