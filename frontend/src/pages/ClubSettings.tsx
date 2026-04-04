import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError, ChipDenominationData, ClubResponse } from "@/api/client";
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
        navigate("/admin");
        return;
      }
      setError(pt.error);
    } finally {
      setLoading(false);
    }
  }, [clubId, token, navigate]);

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
      // Update club settings
      await api.updateClub(
        clubId,
        {
          name: clubName,
          description: clubDesc || null,
          default_rake_buyin: parseFloat(rakebuyin) || 0,
          default_rake_rebuy: parseFloat(rakerebuy) || 0,
          allow_multiple_buyins: allowMultipleBuyins,
        },
        token,
      );

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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500">{pt.loading}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/admin/clubs/${clubId}`)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            &larr; Painel
          </button>
          <h1 className="text-2xl font-bold text-gray-800">{pt.admin.clubs.settingsTitle}</h1>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}
        {msg && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-green-700 text-sm">
            {msg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Club Info */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">Informações do Clube</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  value={clubName}
                  onChange={(e) => setClubName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input
                  type="text"
                  value={clubDesc}
                  onChange={(e) => setClubDesc(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Opcional"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  id="allowMultipleBuyins"
                  checked={allowMultipleBuyins}
                  onChange={(e) => setAllowMultipleBuyins(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <label htmlFor="allowMultipleBuyins" className="text-sm text-gray-700">
                  {pt.admin.settings.allowMultipleBuyins}
                </label>
              </div>
            </div>
          </div>

          {/* Rake Defaults */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <h2 className="text-lg font-semibold mb-2 text-gray-800">{pt.admin.settings.rakeDefaults}</h2>
            <p className="text-sm text-gray-400 mb-4">
              Esses padrões são copiados para novas sessões. Você pode alterá-los por sessão no momento da criação.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.settings.rakeBuyin}
                </label>
                <input
                  type="number"
                  value={rakebuyin}
                  onChange={(e) => setRakeBuyin(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {pt.admin.settings.rakeRebuy}
                </label>
                <input
                  type="number"
                  value={rakerebuy}
                  onChange={(e) => setRakeRebuy(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Chip Denominations */}
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">{pt.admin.settings.chipInventory}</h2>
              <button
                type="button"
                onClick={addChipRow}
                className="px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm font-medium hover:bg-blue-200 transition-colors"
              >
                + {pt.admin.settings.addChip}
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-[10px] uppercase font-bold text-gray-400">
                <span className="col-span-2">{pt.admin.settings.chipLabel}</span>
                <span className="col-span-2">{pt.admin.settings.chipValue}</span>
                <span className="col-span-2">{pt.admin.settings.chipQty}</span>
                <span className="col-span-2">Cor</span>
                <span className="col-span-2">{pt.admin.settings.chipActive}</span>
                <span className="col-span-2 text-right">Ação</span>
              </div>
              {chips.map((chip, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={chip.label}
                    onChange={(e) => updateChip(i, "label", e.target.value)}
                    placeholder="R$5"
                    className="col-span-2 px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <input
                    type="number"
                    value={chip.value}
                    onChange={(e) => updateChip(i, "value", e.target.value)}
                    placeholder="5"
                    className="col-span-2 px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                    min="0.01"
                    step="0.01"
                  />
                  <input
                    type="number"
                    value={chip.quantity}
                    onChange={(e) => updateChip(i, "quantity", e.target.value)}
                    placeholder="100"
                    className="col-span-2 px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                    min="0"
                  />
                  <input
                    type="text"
                    value={chip.color}
                    onChange={(e) => updateChip(i, "color", e.target.value)}
                    placeholder="red"
                    className="col-span-2 px-2 py-1.5 border rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                  />
                  <div className="col-span-2 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={chip.active}
                      onChange={(e) => updateChip(i, "active", e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeChipRow(i)}
                      className="text-red-400 hover:text-red-600 text-xs font-medium"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-lg shadow-blue-200"
          >
            {saving ? pt.admin.clubs.saving : pt.admin.clubs.saveSettings}
          </button>
        </form>
      </div>
    </div>
  );
}
