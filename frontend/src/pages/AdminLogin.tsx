import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await api.login(username, password);
      localStorage.setItem("admin_token", result.access_token);
      localStorage.setItem("auth_role", "superadmin");
      navigate("/admin/clubs");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      <div className="bg-gray-800 rounded-xl shadow-lg p-8 max-w-sm w-full border border-gray-700">
        <h1 className="text-xl font-bold text-center text-gray-200 mb-1">
          {pt.admin.login.title}
        </h1>
        <p className="text-xs text-gray-500 text-center mb-6">Acesso restrito</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {pt.admin.login.phoneLabel}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={pt.admin.login.phonePlaceholder}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-500"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              {pt.admin.login.codeLabel}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={pt.admin.login.codePlaceholder}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder-gray-500"
              required
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? pt.admin.login.loggingIn : pt.admin.login.submit}
          </button>
        </form>
      </div>
    </div>
  );
}
