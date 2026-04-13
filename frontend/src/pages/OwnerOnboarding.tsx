import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

type Step = "theme" | "session";

const defaultColors = {
  primary_color: "#d4a937",
  accent_color: "#1a5c38",
  bg_color: "#0f1419",
  text_color: "#e5e7eb",
};

export default function OwnerOnboarding() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";

  const [step, setStep] = useState<Step>("theme");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Theme form
  const [themeForm, setThemeForm] = useState({
    logo_url: "",
    primary_color: defaultColors.primary_color,
    accent_color: defaultColors.accent_color,
    bg_color: defaultColors.bg_color,
    text_color: defaultColors.text_color,
    font_family: "Inter",
  });

  // Session form
  const [sessionForm, setSessionForm] = useState({
    name: "",
    blinds_info: "",
    buy_in_amount: "",
    rebuy_amount: "",
  });

  const handleThemeSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateClub(clubId!, themeForm, token);
      setStep("session");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setSaving(false);
    }
  };

  const handleSessionCreate = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createSession(
        clubId!,
        {
          name: sessionForm.name,
          blinds_info: sessionForm.blinds_info,
          buy_in_amount: parseFloat(sessionForm.buy_in_amount),
          rebuy_amount: parseFloat(sessionForm.rebuy_amount),
          allow_rebuys: true,
          cash_king_enabled: false,
        },
        token,
      );
      navigate(`/owner/club/${clubId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    if (step === "theme") setStep("session");
    else navigate(`/owner/club/${clubId}`);
  };

  const stepIndex = step === "theme" ? 0 : 1;
  const steps = ["Identidade", "Primeira Sessão"];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 p-4">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                i <= stepIndex
                  ? "bg-green-500 text-white"
                  : "bg-white/10 text-gray-500"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm ${i <= stepIndex ? "text-white" : "text-gray-500"}`}>{label}</span>
            {i < steps.length - 1 && <div className="w-8 h-px bg-white/20" />}
          </div>
        ))}
      </div>

      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20">
        {/* Step 1: Theme */}
        {step === "theme" && (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Personalize seu clube</h2>
            <p className="text-sm text-green-300/70 mb-6">Defina as cores e logo do seu clube</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Logo (URL)</label>
                <input
                  type="url"
                  value={themeForm.logo_url}
                  onChange={(e) => setThemeForm({ ...themeForm, logo_url: e.target.value })}
                  placeholder="https://exemplo.com/logo.png"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["primary_color", "Cor Primária"],
                  ["accent_color", "Cor de Destaque"],
                  ["bg_color", "Cor de Fundo"],
                  ["text_color", "Cor do Texto"],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={themeForm[key]}
                        onChange={(e) => setThemeForm({ ...themeForm, [key]: e.target.value })}
                        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={themeForm[key]}
                        onChange={(e) => setThemeForm({ ...themeForm, [key]: e.target.value })}
                        className="flex-1 px-2 py-1 bg-white/10 border border-white/20 text-white rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Fonte</label>
                <select
                  value={themeForm.font_family}
                  onChange={(e) => setThemeForm({ ...themeForm, font_family: e.target.value })}
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg outline-none"
                >
                  <option value="Inter">Inter</option>
                  <option value="Roboto">Roboto</option>
                  <option value="Poppins">Poppins</option>
                  <option value="Montserrat">Montserrat</option>
                </select>
              </div>

              {/* Preview */}
              <div
                className="rounded-xl p-4 border text-center"
                style={{
                  backgroundColor: themeForm.bg_color,
                  color: themeForm.text_color,
                  borderColor: `${themeForm.primary_color}33`,
                  fontFamily: themeForm.font_family,
                }}
              >
                <p className="text-xs opacity-60 mb-1">Preview</p>
                <p className="font-bold" style={{ color: themeForm.primary_color }}>Seu Clube</p>
                <div className="mt-2 inline-block px-3 py-1 rounded text-sm font-medium" style={{ backgroundColor: themeForm.accent_color }}>
                  Buy-in
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleThemeSave}
                disabled={saving}
                className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
              >
                {saving ? pt.loading : "Salvar e Continuar"}
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-gray-400 hover:text-white text-sm transition-colors"
              >
                Pular
              </button>
            </div>
          </>
        )}

        {/* Step 2: First Session */}
        {step === "session" && (
          <>
            <h2 className="text-xl font-bold text-white mb-1">Crie sua primeira sessão</h2>
            <p className="text-sm text-green-300/70 mb-6">Configure os detalhes da mesa</p>

            <form onSubmit={handleSessionCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Nome da sessão</label>
                <input
                  type="text"
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                  placeholder="Cash Game - Sexta"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Blind (valor)</label>
                <input
                  type="number"
                  value={sessionForm.blinds_info}
                  onChange={(e) => setSessionForm({ ...sessionForm, blinds_info: e.target.value })}
                  placeholder="2"
                  className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
                  required
                  min="0.01"
                  step="any"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Buy-in (R$)</label>
                  <input
                    type="number"
                    value={sessionForm.buy_in_amount}
                    onChange={(e) => setSessionForm({ ...sessionForm, buy_in_amount: e.target.value })}
                    placeholder="100"
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
                    required
                    min="1"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Rebuy (R$)</label>
                  <input
                    type="number"
                    value={sessionForm.rebuy_amount}
                    onChange={(e) => setSessionForm({ ...sessionForm, rebuy_amount: e.target.value })}
                    placeholder="100"
                    className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
                    required
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
                >
                  {saving ? pt.loading : "Criar Sessão"}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-4 py-2.5 text-gray-400 hover:text-white text-sm transition-colors"
                >
                  Pular
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
