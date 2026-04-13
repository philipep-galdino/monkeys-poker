import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

export default function OwnerLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api.ownerLogin(email, password);
      localStorage.setItem("admin_token", result.access_token);
      localStorage.setItem("auth_role", "owner");
      navigate("/owner/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-white/20">
        <h1 className="text-2xl font-bold text-center text-white mb-1">
          {pt.owner.login.title}
        </h1>
        <p className="text-sm text-green-300/70 text-center mb-6">
          Acesse o painel do seu clube
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {pt.owner.login.emailLabel}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={pt.owner.login.emailPlaceholder}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {pt.owner.login.passwordLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={pt.owner.login.passwordPlaceholder}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400"
              required
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 shadow-lg shadow-green-900/30"
          >
            {loading ? pt.owner.login.loggingIn : pt.owner.login.submit}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          Ainda não tem conta?{" "}
          <Link to="/register" className="text-green-400 hover:text-green-300">
            Criar minha conta
          </Link>
        </p>
      </div>
    </div>
  );
}
