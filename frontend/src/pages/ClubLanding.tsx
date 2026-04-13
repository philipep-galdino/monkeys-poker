import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";

type ClubPublic = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  bg_color: string;
  text_color: string;
  font_family: string;
  active_session_id: string | null;
};

export default function ClubLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [club, setClub] = useState<ClubPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!slug) return;
    api
      .getClubBySlug(slug)
      .then(setClub)
      .catch((err) => {
        setError(err instanceof ApiError ? err.detail : "Clube não encontrado");
      })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-500 border-t-transparent" />
      </div>
    );
  }

  if (error || !club) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-2">{error || "Clube não encontrado"}</p>
          <p className="text-gray-600 text-sm">Verifique o endereço e tente novamente</p>
        </div>
      </div>
    );
  }

  const joinUrl = club.active_session_id
    ? `/join/${club.id}/${club.active_session_id}`
    : null;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ backgroundColor: club.bg_color, color: club.text_color, fontFamily: club.font_family }}
    >
      <div className="text-center max-w-sm w-full space-y-6">
        {/* Club logo */}
        {club.logo_url && (
          <img
            src={club.logo_url}
            alt={club.name}
            className="h-20 object-contain mx-auto"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        )}

        {/* Club name */}
        <h1 className="text-3xl font-bold" style={{ color: club.primary_color }}>
          {club.name}
        </h1>

        {/* Active session or no session */}
        {joinUrl ? (
          <div className="space-y-4">
            <div
              className="rounded-2xl p-6"
              style={{ backgroundColor: `${club.text_color}08`, border: `1px solid ${club.text_color}15` }}
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-medium opacity-70">Sessão ativa</span>
              </div>
              <a
                href={joinUrl}
                className="block w-full text-center font-semibold py-3 rounded-xl transition-opacity hover:opacity-90"
                style={{ backgroundColor: club.accent_color, color: club.text_color }}
              >
                Entrar na mesa
              </a>
            </div>

            {/* QR code */}
            <div
              className="rounded-xl p-4 text-center"
              style={{ backgroundColor: `${club.text_color}05`, border: `1px solid ${club.text_color}10` }}
            >
              <p className="text-xs opacity-50 mb-2">Compartilhe o link</p>
              <p className="text-sm font-mono opacity-70 break-all">
                {window.location.origin}{joinUrl}
              </p>
            </div>
          </div>
        ) : (
          <div
            className="rounded-2xl p-8"
            style={{ backgroundColor: `${club.text_color}08`, border: `1px solid ${club.text_color}15` }}
          >
            <p className="opacity-50">Nenhuma sessão ativa no momento</p>
          </div>
        )}

        {/* Powered by */}
        <p className="text-xs opacity-30 mt-8">
          Gerenciado por PokerClub
        </p>
      </div>
    </div>
  );
}
