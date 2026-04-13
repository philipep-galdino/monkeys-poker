import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, ChipDenominationData, ClubResponse } from "@/api/client";
import { useAppMode } from "@/hooks/useAppMode";
import { useClubTheme } from "@/hooks/useClubTheme";
import { pt } from "@/strings";

type ChipRow = {
  label: string;
  value: string;
  quantity: string;
  color: string;
  active: boolean;
  sort_order: number;
};

const emptyRow = (): ChipRow => ({
  label: "",
  value: "",
  quantity: "0",
  color: "",
  active: true,
  sort_order: 0,
});

export default function ClubSettings() {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";
  const { basePath, loginPath } = useAppMode(clubId);
  useClubTheme(clubId);

  const [club, setClub] = useState<ClubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  // Club settings
  const [clubName, setClubName] = useState("");
  const [clubDesc, setClubDesc] = useState("");
  const [rakebuyin, setRakeBuyin] = useState("");
  const [rakerebuy, setRakeRebuy] = useState("");
  const [allowMultipleBuyins, setAllowMultipleBuyins] = useState(false);

  // Payment settings
  const [paymentMode, setPaymentMode] = useState("static_pix");
  const [pixKey, setPixKey] = useState("");
  const [mpAccessToken, setMpAccessToken] = useState("");
  const [mpWebhookSecret, setMpWebhookSecret] = useState("");
  const [hasMpCredentials, setHasMpCredentials] = useState(false);

  // Theme settings
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#d4a937");
  const [accentColor, setAccentColor] = useState("#1a5c38");
  const [bgColor, setBgColor] = useState("#0f1419");
  const [textColor, setTextColor] = useState("#e5e7eb");
  const [bgImageUrl, setBgImageUrl] = useState("");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [tvLayout, setTvLayout] = useState("classic");

  // Chip denominations
  const [chips, setChips] = useState<ChipRow[]>([]);

  const load = useCallback(async () => {
    if (!clubId) return;
    try {
      const [c, denoms] = await Promise.all([
        api.getClub(clubId, token),
        api.getChipDenominations(clubId, token),
      ]);
      setClub(c);
      setClubName(c.name);
      setClubDesc(c.description ?? "");
      setRakeBuyin(String(c.default_rake_buyin));
      setRakeRebuy(String(c.default_rake_rebuy));
      setAllowMultipleBuyins(c.allow_multiple_buyins || false);
      setPaymentMode(c.payment_mode || "static_pix");
      setPixKey(c.pix_key ?? "");
      setHasMpCredentials(c.has_mp_credentials || false);
      setLogoUrl(c.logo_url ?? "");
      setPrimaryColor(c.primary_color || "#d4a937");
      setAccentColor(c.accent_color || "#1a5c38");
      setBgColor(c.bg_color || "#0f1419");
      setTextColor(c.text_color || "#e5e7eb");
      setBgImageUrl(c.bg_image_url ?? "");
      setFontFamily(c.font_family || "Inter");
      setTvLayout(c.tv_layout || "classic");

      if (denoms.length > 0) {
        setChips(
          denoms.map((d) => ({
            label: d.label,
            value: String(d.value),
            quantity: String(d.quantity),
            color: d.color ?? "",
            active: d.active,
            sort_order: d.sort_order,
          })),
        );
      } else {
        setChips([emptyRow()]);
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate(loginPath);
        return;
      }
      setError(pt.error);
    } finally {
      setLoading(false);
    }
  }, [clubId, token, navigate, loginPath]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!clubId) return;
    setSaving(true);
    setMsg("");
    setError("");

    try {
      // Update club settings (including payment config)
      const updateData: Record<string, unknown> = {
        name: clubName,
        description: clubDesc || null,
        default_rake_buyin: parseFloat(rakebuyin) || 0,
        default_rake_rebuy: parseFloat(rakerebuy) || 0,
        allow_multiple_buyins: allowMultipleBuyins,
        payment_mode: paymentMode,
        pix_key: pixKey || null,
      };
      // Only send MP credentials if they were filled in (never overwrite with empty)
      if (mpAccessToken) updateData.mp_access_token = mpAccessToken;
      if (mpWebhookSecret) updateData.mp_webhook_secret = mpWebhookSecret;

      // Theme
      updateData.logo_url = logoUrl || null;
      updateData.primary_color = primaryColor;
      updateData.accent_color = accentColor;
      updateData.bg_color = bgColor;
      updateData.text_color = textColor;
      updateData.bg_image_url = bgImageUrl || null;
      updateData.font_family = fontFamily;
      updateData.tv_layout = tvLayout;

      await api.updateClub(clubId, updateData, token);

      // Update chip denominations (filter out empty rows)
      const validChips = chips
        .filter((c) => c.label.trim() && c.value.trim())
        .map((c, i) => ({
          label: c.label.trim(),
          value: parseFloat(c.value),
          quantity: parseInt(c.quantity) || 0,
          color: c.color.trim() || null,
          active: c.active,
          sort_order: i,
        }));

      await api.setChipDenominations(clubId, validChips, token);
      setMsg(pt.admin.clubs.saveSettings + " - OK");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setSaving(false);
    }
  };

  const addChipRow = () => setChips([...chips, emptyRow()]);

  const removeChipRow = (i: number) => {
    const next = chips.filter((_, idx) => idx !== i);
    setChips(next.length === 0 ? [emptyRow()] : next);
  };

  const updateChip = (i: number, field: keyof ChipRow, value: string | boolean) => {
    const next = [...chips];
    next[i] = { ...next[i], [field]: value };
    setChips(next);
  };

  if (loading) {
    return (
      <div className="themed-shell flex items-center justify-center">
        <p className="themed-muted">{pt.loading}</p>
      </div>
    );
  }

  return (
    <div className="themed-shell px-3 py-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate(basePath)}
            className="themed-muted hover:opacity-100 text-sm"
          >
            &larr; Painel
          </button>
          <h1 className="text-xl sm:text-2xl font-bold themed-heading">{pt.admin.clubs.settingsTitle}</h1>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-500/30 rounded-lg p-3 mb-4 text-red-300 text-sm">
            {error}
          </div>
        )}
        {msg && (
          <div className="bg-green-900/30 border border-green-500/30 rounded-lg p-3 mb-4 text-green-300 text-sm">
            {msg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Club Info */}
          <div className="themed-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4 themed-heading">Informações do Clube</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block themed-label mb-1">Nome</label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="themed-input"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block themed-label mb-1">Descrição</label>
                <input
                  type="text"
                  value={clubDesc}
                  onChange={(e) => setClubDesc(e.target.value)}
                  className="themed-input"
                  placeholder="Opcional"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="allowMultipleBuyins"
                  checked={allowMultipleBuyins}
                  onChange={(e) => setAllowMultipleBuyins(e.target.checked)}
                  className="w-4 h-4 rounded accent-[var(--club-primary)]"
                />
                <label htmlFor="allowMultipleBuyins" className="text-sm themed-label">
                  {pt.admin.settings.allowMultipleBuyins}
                </label>
              </div>
            </div>
          </div>

          {/* Rake Defaults */}
          <div className="themed-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-2 themed-heading">{pt.admin.settings.rakeDefaults}</h2>
            <p className="text-sm themed-muted mb-4">
              Esses padrões são copiados para novas sessões. Você pode alterá-los por sessão no momento da criação.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block themed-label mb-1">
                  {pt.admin.settings.rakeBuyin}
                </label>
                <input
                  type="number"
                  value={rakebuyin}
                  onChange={(e) => setRakeBuyin(e.target.value)}
                  className="themed-input"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block themed-label mb-1">
                  {pt.admin.settings.rakeRebuy}
                </label>
                <input
                  type="number"
                  value={rakerebuy}
                  onChange={(e) => setRakeRebuy(e.target.value)}
                  className="themed-input"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Payment Configuration */}
          <div className="themed-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-2 themed-heading">{pt.admin.settings.paymentConfig}</h2>
            <p className="text-sm themed-muted mb-4">
              Escolha como os jogadores pagam buy-ins e rebuys.
            </p>

            <div className="space-y-3 mb-4">
              <label
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  paymentMode === "static_pix"
                    ? "border-[var(--club-primary)] bg-[var(--club-primary)]/10"
                    : "border-[color-mix(in_srgb,var(--club-text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--club-text)_30%,transparent)]"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="static_pix"
                  checked={paymentMode === "static_pix"}
                  onChange={() => setPaymentMode("static_pix")}
                  className="mt-1 accent-[var(--club-primary)]"
                />
                <div>
                  <p className="font-medium">{pt.admin.settings.paymentModeStaticPix} <span className="text-xs text-green-400 font-normal ml-1">Recomendado</span></p>
                  <p className="text-xs themed-muted mt-0.5">{pt.admin.settings.paymentModeStaticPixDesc}</p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  paymentMode === "mercado_pago"
                    ? "border-[var(--club-primary)] bg-[var(--club-primary)]/10"
                    : "border-[color-mix(in_srgb,var(--club-text)_15%,transparent)] hover:border-[color-mix(in_srgb,var(--club-text)_30%,transparent)]"
                }`}
              >
                <input
                  type="radio"
                  name="paymentMode"
                  value="mercado_pago"
                  checked={paymentMode === "mercado_pago"}
                  onChange={() => setPaymentMode("mercado_pago")}
                  className="mt-1 accent-[var(--club-primary)]"
                />
                <div>
                  <p className="font-medium">{pt.admin.settings.paymentModeMP}</p>
                  <p className="text-xs themed-muted mt-0.5">{pt.admin.settings.paymentModeMPDesc}</p>
                </div>
              </label>
            </div>

            {/* Static Pix fields */}
            {paymentMode === "static_pix" && (
              <div>
                <label className="block themed-label mb-1">
                  {pt.admin.settings.pixKeyLabel}
                </label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  placeholder={pt.admin.settings.pixKeyPlaceholder}
                  className="themed-input"
                />
              </div>
            )}

            {/* Mercado Pago fields */}
            {paymentMode === "mercado_pago" && (
              <div className="space-y-3">
                <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3">
                  <p className="text-xs text-yellow-300">{pt.admin.settings.mpFeeWarning}</p>
                </div>

                {hasMpCredentials && !mpAccessToken && (
                  <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-2">
                    <p className="text-xs text-green-300">{pt.admin.settings.mpCredentialsConfigured}</p>
                  </div>
                )}

                <div>
                  <label className="block themed-label mb-1">
                    {pt.admin.settings.mpAccessTokenLabel}
                  </label>
                  <input
                    type="password"
                    value={mpAccessToken}
                    onChange={(e) => setMpAccessToken(e.target.value)}
                    placeholder={hasMpCredentials ? "••••••••" : "APP_USR-..."}
                    className="themed-input !font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block themed-label mb-1">
                    {pt.admin.settings.mpWebhookSecretLabel}
                  </label>
                  <input
                    type="password"
                    value={mpWebhookSecret}
                    onChange={(e) => setMpWebhookSecret(e.target.value)}
                    placeholder={hasMpCredentials ? "••••••••" : "Webhook secret do MP"}
                    className="themed-input !font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Theme Builder */}
          <div className="themed-card p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4 themed-heading">{pt.admin.theme.title}</h2>

            <div className="space-y-4">
              <div>
                <label className="block themed-label mb-1">
                  {pt.admin.theme.logoUrl}
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder={pt.admin.theme.logoPlaceholder}
                  className="themed-input"
                />
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="logo"
                    className="mt-2 h-12 object-contain"
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                )}
              </div>

              <div>
                <label className="block themed-label mb-1">
                  Imagem de Fundo (URL)
                </label>
                <input
                  type="url"
                  value={bgImageUrl}
                  onChange={(e) => setBgImageUrl(e.target.value)}
                  placeholder="https://exemplo.com/bg.jpg"
                  className="themed-input"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField label={pt.admin.theme.primaryColor} value={primaryColor} onChange={setPrimaryColor} />
                <ColorField label={pt.admin.theme.accentColor} value={accentColor} onChange={setAccentColor} />
                <ColorField label={pt.admin.theme.bgColor} value={bgColor} onChange={setBgColor} />
                <ColorField label={pt.admin.theme.textColor} value={textColor} onChange={setTextColor} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block themed-label mb-1">
                    {pt.admin.theme.fontFamily}
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="themed-input"
                  >
                    <option value="Inter">Inter</option>
                    <option value="Roboto">Roboto</option>
                    <option value="Poppins">Poppins</option>
                    <option value="Montserrat">Montserrat</option>
                    <option value="system-ui">Sistema</option>
                  </select>
                </div>
                <div>
                  <label className="block themed-label mb-1">
                    {pt.admin.theme.tvLayout}
                  </label>
                  <select
                    value={tvLayout}
                    onChange={(e) => setTvLayout(e.target.value)}
                    className="themed-input"
                  >
                    <option value="classic">{pt.admin.theme.layoutClassic}</option>
                    <option value="cards">{pt.admin.theme.layoutCards}</option>
                    <option value="minimal">{pt.admin.theme.layoutMinimal}</option>
                  </select>
                </div>
              </div>

              {/* Live preview */}
              <div>
                <p className="text-xs themed-muted mb-2">{pt.admin.theme.preview}</p>
                <div
                  className="rounded-lg p-4 border"
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    fontFamily,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {logoUrl && <img src={logoUrl} alt="" className="h-8 object-contain" />}
                    <span className="font-bold text-lg" style={{ color: primaryColor }}>
                      {clubName || "Meu Clube"}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded text-sm font-semibold"
                    style={{ backgroundColor: accentColor, color: textColor }}
                  >
                    Botão
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Chip Denominations */}
          <div className="themed-card p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold themed-heading">{pt.admin.settings.chipInventory}</h2>
              <button
                type="button"
                onClick={addChipRow}
                className="themed-btn-accent px-3 py-1 rounded text-sm"
              >
                + {pt.admin.settings.addChip}
              </button>
            </div>
            {/* Desktop grid */}
            <div className="hidden sm:block space-y-3">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold themed-muted">
                <span className="col-span-2">{pt.admin.settings.chipLabel}</span>
                <span className="col-span-2">{pt.admin.settings.chipValue}</span>
                <span className="col-span-2">{pt.admin.settings.chipQty}</span>
                <span className="col-span-2">Cor</span>
                <span className="col-span-2">{pt.admin.settings.chipActive}</span>
                <span className="col-span-2 text-right">Ação</span>
              </div>
              {chips.map((chip, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input type="text" value={chip.label} onChange={(e) => updateChip(i, "label", e.target.value)} placeholder="R$5" className="col-span-2 themed-input text-sm px-2 py-1.5" />
                  <input type="number" value={chip.value} onChange={(e) => updateChip(i, "value", e.target.value)} placeholder="5" className="col-span-2 themed-input text-sm px-2 py-1.5" min="0.01" step="0.01" />
                  <input type="number" value={chip.quantity} onChange={(e) => updateChip(i, "quantity", e.target.value)} placeholder="100" className="col-span-2 themed-input text-sm px-2 py-1.5" min="0" />
                  <input type="text" value={chip.color} onChange={(e) => updateChip(i, "color", e.target.value)} placeholder="red" className="col-span-2 themed-input text-sm px-2 py-1.5" />
                  <div className="col-span-2 flex items-center justify-center">
                    <input type="checkbox" checked={chip.active} onChange={(e) => updateChip(i, "active", e.target.checked)} className="w-4 h-4 rounded accent-[var(--club-primary)]" />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button type="button" onClick={() => removeChipRow(i)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remover</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {chips.map((chip, i) => (
                <div key={i} className="rounded-lg p-3" style={{ backgroundColor: "color-mix(in srgb, var(--club-bg) 80%, white)", border: "1px solid color-mix(in srgb, var(--club-text) 10%, transparent)" }}>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[10px] uppercase themed-muted mb-0.5">{pt.admin.settings.chipLabel}</label>
                      <input type="text" value={chip.label} onChange={(e) => updateChip(i, "label", e.target.value)} placeholder="R$5" className="themed-input text-sm px-2 py-1.5" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase themed-muted mb-0.5">{pt.admin.settings.chipValue}</label>
                      <input type="number" value={chip.value} onChange={(e) => updateChip(i, "value", e.target.value)} placeholder="5" className="themed-input text-sm px-2 py-1.5" min="0.01" step="0.01" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase themed-muted mb-0.5">{pt.admin.settings.chipQty}</label>
                      <input type="number" value={chip.quantity} onChange={(e) => updateChip(i, "quantity", e.target.value)} placeholder="100" className="themed-input text-sm px-2 py-1.5" min="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase themed-muted mb-0.5">Cor</label>
                      <input type="text" value={chip.color} onChange={(e) => updateChip(i, "color", e.target.value)} placeholder="red" className="themed-input text-sm px-2 py-1.5" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs themed-muted">
                      <input type="checkbox" checked={chip.active} onChange={(e) => updateChip(i, "active", e.target.checked)} className="w-4 h-4 rounded accent-[var(--club-primary)]" />
                      {pt.admin.settings.chipActive}
                    </label>
                    <button type="button" onClick={() => removeChipRow(i)} className="text-red-400 hover:text-red-600 text-xs font-medium">Remover</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full themed-btn-primary py-3 rounded-lg text-base"
          >
            {saving ? pt.admin.clubs.saving : pt.admin.clubs.saveSettings}
          </button>
        </form>
      </div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block themed-label mb-1">{label}</label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded border border-[color-mix(in_srgb,var(--club-text)_18%,transparent)] cursor-pointer bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="themed-input flex-1 font-mono text-sm"
          maxLength={7}
        />
      </div>
    </div>
  );
}
