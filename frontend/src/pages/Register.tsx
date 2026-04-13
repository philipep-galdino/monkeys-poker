import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "@/api/client";
import { pt } from "@/strings";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7)
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    clubName: "",
    clubSlug: "",
  });
  const [slugEdited, setSlugEdited] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-generate slug from club name unless manually edited
      if (field === "clubName" && !slugEdited) {
        next.clubSlug = slugify(value);
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const digits = form.phone.replace(/\D/g, "");

    try {
      const result = await api.ownerRegister({
        name: form.name.trim(),
        email: form.email.trim(),
        phone: digits,
        password: form.password,
        club_name: form.clubName.trim(),
        club_slug: form.clubSlug.trim(),
      });
      localStorage.setItem("admin_token", result.access_token);
      localStorage.setItem("auth_role", "owner");
      navigate("/owner/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    } finally {
      setLoading(false);
    }
  };

  const r = pt.owner.register;
  const inputClass =
    "w-full px-4 py-2 bg-white/10 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-green-400 outline-none placeholder-gray-400";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-green-950 to-gray-900 p-4">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl shadow-2xl p-8 max-w-md w-full border border-white/20">
        <h1 className="text-2xl font-bold text-center text-white mb-1">
          {r.title}
        </h1>
        <p className="text-sm text-green-300/70 text-center mb-6">
          {r.subtitle}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Owner fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.nameLabel}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder={r.namePlaceholder}
                className={inputClass}
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.emailLabel}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                placeholder={r.emailPlaceholder}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.phoneLabel}</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => update("phone", formatPhone(e.target.value))}
                placeholder={r.phonePlaceholder}
                className={inputClass}
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.passwordLabel}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                placeholder={r.passwordPlaceholder}
                className={inputClass}
                required
                minLength={6}
              />
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/10" />

          {/* Club fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.clubNameLabel}</label>
              <input
                type="text"
                value={form.clubName}
                onChange={(e) => update("clubName", e.target.value)}
                placeholder={r.clubNamePlaceholder}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">{r.clubSlugLabel}</label>
              <input
                type="text"
                value={form.clubSlug}
                onChange={(e) => {
                  setSlugEdited(true);
                  update("clubSlug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                placeholder={r.clubSlugPlaceholder}
                className={inputClass}
                required
                pattern="^[a-z0-9\-]+$"
              />
              <p className="text-xs text-gray-500 mt-1">{r.clubSlugHint}</p>
            </div>
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white font-semibold py-2.5 rounded-lg hover:bg-green-500 transition-colors disabled:opacity-50 shadow-lg shadow-green-900/30"
          >
            {loading ? r.creating : r.submit}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-4">
          {r.hasAccount}{" "}
          <Link to="/owner" className="text-green-400 hover:text-green-300">
            {r.loginLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
