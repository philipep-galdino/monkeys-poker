import { FormEvent, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

type Step = "theme" | "settings" | "session";
const STEP_ORDER: Step[] = ["theme", "settings", "session"];

type ChipRow = {
  label: string;
  value: string;
  quantity: string;
  color: string;
};

const defaultColors = {
  primary_color: "#d4a937",
  accent_color: "#1a5c38",
  bg_color: "#0f1419",
  text_color: "#e5e7eb",
};

const CHIP_PRESETS: ChipRow[] = [
  { label: "Branca", value: "1", quantity: "50", color: "#ffffff" },
  { label: "Vermelha", value: "5", quantity: "50", color: "#ef4444" },
  { label: "Verde", value: "25", quantity: "30", color: "#22c55e" },
  { label: "Azul", value: "50", quantity: "20", color: "#3b82f6" },
  { label: "Preta", value: "100", quantity: "20", color: "#1f2937" },
];

export default function OwnerOnboarding() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";

  const [step, setStep] = useState<Step>("theme");
  const [maxVisited, setMaxVisited] = useState(0);
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

  // Club settings form
  const [settingsForm, setSettingsForm] = useState({
    default_rake_buyin: "0",
    default_rake_rebuy: "0",
    pix_key: "",
    payment_mode: "static_pix",
    allow_multiple_buyins: false,
  });

  // Chip denominations
  const [chips, setChips] = useState<ChipRow[]>([
    { label: "", value: "", quantity: "0", color: "" },
  ]);

  // Session form
  const [sessionForm, setSessionForm] = useState({
    name: "",
    blinds_info: "",
    buy_in_amount: "",
    rebuy_amount: "",
  });

  const stepIndex = STEP_ORDER.indexOf(step);

  const goTo = (target: Step) => {
    setError("");
    setStep(target);
  };

  const advance = (next: Step) => {
    const nextIdx = STEP_ORDER.indexOf(next);
    if (nextIdx > maxVisited) setMaxVisited(nextIdx);
    goTo(next);
  };

  const handleThemeSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateClub(clubId!, themeForm, token);
      advance("settings");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.updateClub(
        clubId!,
        {
          default_rake_buyin: parseFloat(settingsForm.default_rake_buyin) || 0,
          default_rake_rebuy: parseFloat(settingsForm.default_rake_rebuy) || 0,
          pix_key: settingsForm.pix_key || null,
          payment_mode: settingsForm.payment_mode,
          allow_multiple_buyins: settingsForm.allow_multiple_buyins,
        },
        token,
      );

      // Save chip denominations (filter empty rows)
      const validChips = chips
        .filter((c) => c.label.trim() && c.value.trim())
        .map((c, i) => ({
          label: c.label.trim(),
          value: parseFloat(c.value),
          quantity: parseInt(c.quantity) || 0,
          color: c.color.trim() || null,
          active: true,
          sort_order: i,
        }));

      if (validChips.length > 0) {
        await api.setChipDenominations(clubId!, validChips, token);
      }

      advance("session");
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
    const nextIdx = stepIndex + 1;
    if (nextIdx < STEP_ORDER.length) advance(STEP_ORDER[nextIdx]);
    else navigate(`/owner/club/${clubId}`);
  };

  const handleBack = () => {
    if (stepIndex > 0) goTo(STEP_ORDER[stepIndex - 1]);
  };

  const loadPresetChips = () => setChips([...CHIP_PRESETS]);

  const addChipRow = () =>
    setChips([...chips, { label: "", value: "", quantity: "0", color: "" }]);

  const removeChipRow = (i: number) => {
    const next = chips.filter((_, idx) => idx !== i);
    setChips(next.length === 0 ? [{ label: "", value: "", quantity: "0", color: "" }] : next);
  };

  const updateChip = (i: number, field: keyof ChipRow, value: string) => {
    const next = [...chips];
    next[i] = { ...next[i], [field]: value };
    setChips(next);
  };

  // Theme-derived styles
  const bg = themeForm.bg_color || defaultColors.bg_color;
  const txt = themeForm.text_color || defaultColors.text_color;
  const primary = themeForm.primary_color || defaultColors.primary_color;
  const accent = themeForm.accent_color || defaultColors.accent_color;

  const inputStyle = {
    backgroundColor: `color-mix(in srgb, ${bg} 70%, black)`,
    border: `1px solid color-mix(in srgb, ${txt} 18%, transparent)`,
    color: txt,
  };
  const labelStyle = { color: `color-mix(in srgb, ${txt} 80%, transparent)` };
  const mutedStyle = { color: `color-mix(in srgb, ${txt} 60%, transparent)` };
  const inputCls = "w-full px-4 py-2 rounded-lg outline-none transition-all";
  const inputSmCls = "w-full px-2 py-1.5 rounded text-sm outline-none transition-all";

  const steps = ["Identidade", "Configurações", "Primeira Sessão"];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-3 py-6 sm:p-4"
      style={{
        background: `linear-gradient(135deg, ${bg} 0%, color-mix(in srgb, ${bg} 85%, ${accent}) 50%, ${bg} 100%)`,
        color: txt,
        fontFamily: themeForm.font_family || "Inter",
      }}
    >
      {/* Progress — clickable to return to completed steps */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
        {steps.map((label, i) => {
          const canClick = i <= maxVisited && i !== stepIndex;
          return (
            <div key={label} className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => canClick && goTo(STEP_ORDER[i])}
                disabled={!canClick}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-colors disabled:cursor-default shrink-0"
                style={{
                  backgroundColor: i <= stepIndex ? primary : i <= maxVisited ? `color-mix(in srgb, ${primary} 40%, transparent)` : `color-mix(in srgb, ${txt} 15%, transparent)`,
                  color: i <= stepIndex ? bg : i <= maxVisited ? txt : `color-mix(in srgb, ${txt} 50%, transparent)`,
                  cursor: canClick ? "pointer" : "default",
                }}
              >
                {i < stepIndex ? "✓" : i + 1}
              </button>
              <span
                className="text-xs sm:text-sm hidden sm:inline"
                style={{
                  color: i <= stepIndex ? txt : `color-mix(in srgb, ${txt} 50%, transparent)`,
                  cursor: canClick ? "pointer" : "default",
                }}
                onClick={() => canClick && goTo(STEP_ORDER[i])}
              >
                {label}
              </span>
              {i < steps.length - 1 && (
                <div className="w-4 sm:w-8 h-px" style={{ backgroundColor: `color-mix(in srgb, ${txt} 20%, transparent)` }} />
              )}
            </div>
          );
        })}
      </div>

      <div
        className="backdrop-blur-md rounded-2xl shadow-2xl p-5 sm:p-8 w-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${bg} 80%, white)`,
          border: `1px solid color-mix(in srgb, ${txt} 15%, transparent)`,
          maxWidth: step === "settings" ? "36rem" : "28rem",
          transition: "max-width 0.3s ease",
        }}
      >
        {/* Step 1: Theme */}
        {step === "theme" && (
          <>
            <h2 className="text-xl font-bold mb-1">Personalize seu clube</h2>
            <p className="text-sm mb-6" style={mutedStyle}>
              Defina as cores e logo do seu clube
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>Logo (URL)</label>
                <input
                  type="url"
                  value={themeForm.logo_url}
                  onChange={(e) => setThemeForm({ ...themeForm, logo_url: e.target.value })}
                  placeholder="https://exemplo.com/logo.png"
                  className={inputCls}
                  style={inputStyle}
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
                    <label className="block text-xs font-medium mb-1" style={{ color: `color-mix(in srgb, ${txt} 70%, transparent)` }}>
                      {label}
                    </label>
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
                        className="flex-1 px-2 py-1 rounded text-xs font-mono"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>Fonte</label>
                <select
                  value={themeForm.font_family}
                  onChange={(e) => setThemeForm({ ...themeForm, font_family: e.target.value })}
                  className={`${inputCls} themed-select`}
                  style={inputStyle}
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
                  backgroundColor: bg,
                  color: txt,
                  borderColor: `${primary}33`,
                  fontFamily: themeForm.font_family,
                }}
              >
                <p className="text-xs opacity-60 mb-1">Preview</p>
                <p className="font-bold" style={{ color: primary }}>Seu Clube</p>
                <div
                  className="mt-2 inline-block px-3 py-1 rounded text-sm font-medium"
                  style={{ backgroundColor: accent, color: txt }}
                >
                  Buy-in
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleThemeSave}
                disabled={saving}
                className="flex-1 font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50"
                style={{ backgroundColor: primary, color: bg }}
              >
                {saving ? pt.loading : "Salvar e Continuar"}
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-sm transition-colors hover:opacity-100"
                style={mutedStyle}
              >
                Pular
              </button>
            </div>
          </>
        )}

        {/* Step 2: Club Settings */}
        {step === "settings" && (
          <>
            <h2 className="text-xl font-bold mb-1">Configure seu clube</h2>
            <p className="text-sm mb-6" style={mutedStyle}>
              Rake, pagamento, fichas e regras do clube
            </p>

            <div className="space-y-5">
              {/* Rake */}
              <div>
                <p className="text-sm font-semibold mb-2" style={labelStyle}>Rake padrão</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={mutedStyle}>Buy-in (R$)</label>
                    <input
                      type="number"
                      value={settingsForm.default_rake_buyin}
                      onChange={(e) => setSettingsForm({ ...settingsForm, default_rake_buyin: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={mutedStyle}>Rebuy (R$)</label>
                    <input
                      type="number"
                      value={settingsForm.default_rake_rebuy}
                      onChange={(e) => setSettingsForm({ ...settingsForm, default_rake_rebuy: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              {/* Allow multiple buy-ins */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settingsForm.allow_multiple_buyins}
                  onChange={(e) => setSettingsForm({ ...settingsForm, allow_multiple_buyins: e.target.checked })}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: primary }}
                />
                <span className="text-sm" style={labelStyle}>Permitir múltiplos buy-ins por jogador</span>
              </label>

              {/* Payment mode */}
              <div>
                <p className="text-sm font-semibold mb-2" style={labelStyle}>Modo de pagamento</p>
                <div className="space-y-2">
                  {([
                    ["static_pix", "Pix Estático", "Jogadores enviam Pix manualmente."],
                    ["mercado_pago", "Mercado Pago", "QR Pix automático com confirmação instantânea."],
                  ] as const).map(([mode, label, desc]) => (
                    <label
                      key={mode}
                      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all"
                      style={{
                        border: `2px solid ${settingsForm.payment_mode === mode ? primary : `color-mix(in srgb, ${txt} 15%, transparent)`}`,
                        backgroundColor: settingsForm.payment_mode === mode ? `color-mix(in srgb, ${primary} 10%, transparent)` : "transparent",
                      }}
                    >
                      <input
                        type="radio"
                        name="paymentMode"
                        value={mode}
                        checked={settingsForm.payment_mode === mode}
                        onChange={() => setSettingsForm({ ...settingsForm, payment_mode: mode })}
                        className="mt-1"
                        style={{ accentColor: primary }}
                      />
                      <div>
                        <p className="font-medium text-sm">{label}</p>
                        <p className="text-xs mt-0.5" style={mutedStyle}>{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {settingsForm.payment_mode === "static_pix" && (
                <div>
                  <label className="block text-sm font-medium mb-1" style={labelStyle}>Chave Pix</label>
                  <input
                    type="text"
                    value={settingsForm.pix_key}
                    onChange={(e) => setSettingsForm({ ...settingsForm, pix_key: e.target.value })}
                    placeholder="CPF, email, telefone ou chave aleatória"
                    className={inputCls}
                    style={inputStyle}
                  />
                </div>
              )}

              {/* Chip inventory */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold" style={labelStyle}>Inventário de fichas</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={loadPresetChips}
                      className="px-2 py-1 rounded text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${accent} 20%, transparent)`,
                        color: txt,
                      }}
                    >
                      Carregar padrão
                    </button>
                    <button
                      type="button"
                      onClick={addChipRow}
                      className="px-2 py-1 rounded text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${primary} 20%, transparent)`,
                        color: txt,
                      }}
                    >
                      + Ficha
                    </button>
                  </div>
                </div>
                <p className="text-xs mb-3" style={mutedStyle}>
                  Defina as fichas do seu clube — nome, valor (R$), quantidade e cor.
                </p>

                <div className="space-y-2">
                  {chips.map((chip, i) => (
                    <div key={i} className="rounded-lg p-2 sm:p-0" style={{ backgroundColor: `color-mix(in srgb, ${txt} 5%, transparent)`, border: `1px solid color-mix(in srgb, ${txt} 8%, transparent)` }}>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:gap-2">
                        <input
                          type="text"
                          value={chip.label}
                          onChange={(e) => updateChip(i, "label", e.target.value)}
                          placeholder="Nome"
                          className={inputSmCls}
                          style={{ ...inputStyle, flex: 2 }}
                        />
                        <input
                          type="number"
                          value={chip.value}
                          onChange={(e) => updateChip(i, "value", e.target.value)}
                          placeholder="Valor"
                          className={inputSmCls}
                          style={{ ...inputStyle, flex: 1 }}
                          min="0.01"
                          step="0.01"
                        />
                        <input
                          type="number"
                          value={chip.quantity}
                          onChange={(e) => updateChip(i, "quantity", e.target.value)}
                          placeholder="Qtd"
                          className={inputSmCls}
                          style={{ ...inputStyle, flex: 1 }}
                          min="0"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={chip.color || "#888888"}
                            onChange={(e) => updateChip(i, "color", e.target.value)}
                            className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent shrink-0"
                          />
                          <button
                            type="button"
                            onClick={() => removeChipRow(i)}
                            className="text-red-400 hover:text-red-300 text-xs shrink-0"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center mt-3">{error}</p>}

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleBack}
                className="px-4 py-2.5 text-sm transition-colors hover:opacity-100"
                style={mutedStyle}
              >
                ← Voltar
              </button>
              <button
                onClick={handleSettingsSave}
                disabled={saving}
                className="flex-1 font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50"
                style={{ backgroundColor: primary, color: bg }}
              >
                {saving ? pt.loading : "Salvar e Continuar"}
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-sm transition-colors hover:opacity-100"
                style={mutedStyle}
              >
                Pular
              </button>
            </div>
          </>
        )}

        {/* Step 3: First Session */}
        {step === "session" && (
          <>
            <h2 className="text-xl font-bold mb-1">Crie sua primeira sessão</h2>
            <p className="text-sm mb-6" style={mutedStyle}>
              Configure os detalhes da mesa
            </p>

            <form onSubmit={handleSessionCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>Nome da sessão</label>
                <input
                  type="text"
                  value={sessionForm.name}
                  onChange={(e) => setSessionForm({ ...sessionForm, name: e.target.value })}
                  placeholder="Cash Game - Sexta"
                  className={inputCls}
                  style={inputStyle}
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={labelStyle}>Blind (valor)</label>
                <input
                  type="number"
                  value={sessionForm.blinds_info}
                  onChange={(e) => setSessionForm({ ...sessionForm, blinds_info: e.target.value })}
                  placeholder="2"
                  className={inputCls}
                  style={inputStyle}
                  required
                  min="0.01"
                  step="any"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1" style={labelStyle}>Buy-in (R$)</label>
                  <input
                    type="number"
                    value={sessionForm.buy_in_amount}
                    onChange={(e) => setSessionForm({ ...sessionForm, buy_in_amount: e.target.value })}
                    placeholder="100"
                    className={inputCls}
                    style={inputStyle}
                    required
                    min="1"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" style={labelStyle}>Rebuy (R$)</label>
                  <input
                    type="number"
                    value={sessionForm.rebuy_amount}
                    onChange={(e) => setSessionForm({ ...sessionForm, rebuy_amount: e.target.value })}
                    placeholder="100"
                    className={inputCls}
                    style={inputStyle}
                    required
                    min="1"
                    step="0.01"
                  />
                </div>
              </div>

              {error && <p className="text-red-400 text-sm text-center">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-2.5 text-sm transition-colors hover:opacity-100"
                  style={mutedStyle}
                >
                  ← Voltar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 font-semibold py-2.5 rounded-lg transition-all disabled:opacity-50"
                  style={{ backgroundColor: primary, color: bg }}
                >
                  {saving ? pt.loading : "Criar Sessão"}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="px-4 py-2.5 text-sm transition-colors hover:opacity-100"
                  style={mutedStyle}
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
