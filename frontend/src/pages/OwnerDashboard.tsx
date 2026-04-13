import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, ClubResponse } from "@/api/client";
import { pt } from "@/strings";

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("admin_token") ?? "";
  const [clubs, setClubs] = useState<ClubResponse[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      navigate("/owner");
      return;
    }

    api
      .listClubs(token)
      .then((result) => {
        if (result.items.length === 1) {
          const club = result.items[0];
          const createdAt = new Date(club.created_at).getTime();
          const isNew = Date.now() - createdAt < 60 * 60 * 1000; // less than 1 hour old
          if (isNew) {
            navigate(`/owner/club/${club.id}/setup`, { replace: true });
          } else {
            navigate(`/owner/club/${club.id}`, { replace: true });
          }
        } else if (result.items.length === 0) {
          setClubs([]);
        } else {
          setClubs(result.items);
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
          localStorage.removeItem("admin_token");
          localStorage.removeItem("auth_role");
          navigate("/owner");
          return;
        }
        setError(pt.error);
      });
  }, [token, navigate]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("auth_role");
    navigate("/owner");
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-white">
            {pt.owner.dashboard.logout}
          </button>
        </div>
      </div>
    );
  }

  // Still loading / redirecting to single club
  if (clubs === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <p className="text-gray-400">{pt.owner.dashboard.loading}</p>
      </div>
    );
  }

  // No clubs linked
  if (clubs.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{pt.owner.dashboard.noClub}</p>
          <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-white">
            {pt.owner.dashboard.logout}
          </button>
        </div>
      </div>
    );
  }

  // Multiple clubs - let owner pick
  return (
    <div className="min-h-screen bg-gray-900 p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">Selecione seu clube</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-white transition-colors"
          >
            {pt.owner.dashboard.logout}
          </button>
        </div>
        <div className="grid gap-3">
          {clubs.map((club) => (
            <button
              key={club.id}
              onClick={() => navigate(`/owner/club/${club.id}`)}
              className="bg-white/10 backdrop-blur rounded-xl p-5 text-left hover:bg-white/15 border border-white/10 hover:border-green-500/40 transition-all w-full group"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-white group-hover:text-green-400 transition-colors">
                    {club.name}
                  </h3>
                  <p className="text-xs text-gray-500 font-mono">/{club.slug}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-600 group-hover:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
