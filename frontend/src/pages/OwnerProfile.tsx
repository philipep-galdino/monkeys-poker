import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, OwnerResponse } from "@/api/client";
import { pt } from "@/strings";

export default function OwnerProfile() {
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";

  const [profile, setProfile] = useState<OwnerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Password change
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/owner");
      return;
    }
    api
      .getOwnerProfile(token)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          localStorage.removeItem("admin_token");
          localStorage.removeItem("auth_role");
          navigate("/owner");
          return;
        }
        setError(pt.error);
      })
      .finally(() => setLoading(false));
  }, [token, navigate]);

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPwError("");
    setPwSuccess("");

    if (pwForm.newPw !== pwForm.confirm) {
      setPwError("As senhas não coincidem");
      return;
    }

    setPwSaving(true);
    try {
      await api.changeOwnerPassword(pwForm.current, pwForm.newPw, token);
      setPwSuccess("Senha alterada com sucesso");
      setPwForm({ current: "", newPw: "", confirm: "" });
    } catch (err) {
      setPwError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setPwSaving(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("auth_role");
    navigate("/owner");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <p className="text-gray-400">{pt.loading}</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <p className="text-red-400">{error || pt.error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/owner/dashboard")}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            &larr; Voltar
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 transition-colors"
          >
            Sair
          </button>
        </div>

        {/* Profile info */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
          <h1 className="text-xl font-bold text-white mb-4">Meu Perfil</h1>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Nome</p>
              <p className="text-white font-medium">{profile.name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">E-mail</p>
              <p className="text-white font-medium">{profile.email}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Telefone</p>
              <p className="text-white font-medium">{profile.phone}</p>
            </div>
          </div>
        </div>

        {/* Password change */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/10">
          <h2 className="text-lg font-bold text-white mb-4">Alterar Senha</h2>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <input
              type="password"
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
              placeholder="Senha atual"
              className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
              required
            />
            <input
              type="password"
              value={pwForm.newPw}
              onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })}
              placeholder="Nova senha"
              className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
              required
              minLength={6}
            />
            <input
              type="password"
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
              placeholder="Confirmar nova senha"
              className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
              required
              minLength={6}
            />

            {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
            {pwSuccess && <p className="text-green-400 text-sm">{pwSuccess}</p>}

            <button
              type="submit"
              disabled={pwSaving}
              className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50"
            >
              {pwSaving ? pt.loading : "Alterar Senha"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
