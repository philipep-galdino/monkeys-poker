import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TVLobby from "@/pages/TVLobby";
import PlayerJoin from "@/pages/PlayerJoin";
import PlayerSession from "@/pages/PlayerSession";
import AdminLogin from "@/pages/AdminLogin";
import ClubList from "@/pages/ClubList";
import ClubDashboard from "@/pages/ClubDashboard";
import ClubSettings from "@/pages/ClubSettings";
import SessionHistory from "@/pages/SessionHistory";
import SessionDetail from "@/pages/SessionDetail";
import PlayerHistory from "@/pages/PlayerHistory";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Admin */}
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/clubs" element={<ClubList />} />
          <Route path="/admin/clubs/:clubId" element={<ClubDashboard />} />
          <Route path="/admin/clubs/:clubId/settings" element={<ClubSettings />} />
          <Route path="/admin/clubs/:clubId/history" element={<SessionHistory />} />
          <Route path="/admin/clubs/:clubId/sessions/:sessionId" element={<SessionDetail />} />

          {/* Player-facing (club-scoped) */}
          <Route path="/tv/:clubId/:sessionId" element={<TVLobby />} />
          <Route path="/join/:clubId/:sessionId" element={<PlayerJoin />} />
          <Route
            path="/session/:clubId/:sessionId/player/:token"
            element={<PlayerSession />}
          />
          <Route
            path="/history/:clubId/:sessionId/:token"
            element={<PlayerHistory />}
          />

          {/* 404 */}
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">Página não encontrada</p>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
