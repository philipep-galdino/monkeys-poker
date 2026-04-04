import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, ClubResponse } from "@/api/client";
import { pt } from "@/strings";

export default function ClubList() {
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";

  const [clubs, setClubs] = useState<ClubResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", slug: "" });

  const loadClubs = useCallback(async () => {
    try {
      const result = await api.listClubs(token);
      setClubs(result.items);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        navigate("/admin");
        return;
      }
      setError(pt.error);
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    loadClubs();
  }, [loadClubs]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const club = await api.createClub(
        { name: createForm.name, slug: createForm.slug },
        token,
      );
      navigate(`/admin/clubs/${club.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : pt.error);
    }
  };

  const autoSlug = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .slice(0, 100);

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{pt.admin.clubs.title}</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + {pt.admin.clubs.newClub}
            </button>
            <button
              onClick={() => {
                localStorage.removeItem("admin_token");
                navigate("/admin");
              }}
              className="text-sm text-gray-400 hover:text-gray-600 px-3 py-2 transition-colors"
            >
              Sair
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {showCreate && (
          <div className="bg-white rounded-xl shadow-md p-6 mb-6 border border-blue-100">
            <h2 className="text-lg font-semibold mb-4 text-gray-800">{pt.admin.clubs.newClub}</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome do Clube
                </label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) =>
                    setCreateForm({
                      name: e.target.value,
                      slug: autoSlug(e.target.value),
                    })
                  }
                  placeholder="Meu Clube de Poker"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Slug (URL identificadora)
                </label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, slug: e.target.value })
                  }
                  placeholder="meu-clube-de-poker"
                  className="w-full px-4 py-2 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                  pattern="^[a-z0-9\-]+$"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Apenas letras minúsculas, números e traços
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Criar Clube
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 bg-gray-50 text-gray-600 py-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {clubs.length === 0 && !showCreate && (
          <div className="bg-white rounded-xl shadow-md p-12 text-center border-2 border-dashed border-gray-200">
            <p className="text-gray-400 text-lg mb-4">{pt.admin.clubs.noClubs}</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Criar meu primeiro clube
            </button>
          </div>
        )}

        <div className="grid gap-4">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => navigate(`/admin/clubs/${club.id}`)}
              className="bg-white rounded-xl shadow-md p-6 text-left hover:shadow-lg hover:border-blue-200 border border-transparent transition-all w-full group"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                    {club.name}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono">/{club.slug}</p>
                </div>
                <div className="text-gray-300 group-hover:text-blue-300">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
              {club.description && (
                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{club.description}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
