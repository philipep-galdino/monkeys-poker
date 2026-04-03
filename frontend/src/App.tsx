import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TVLobby from "@/pages/TVLobby";
import PlayerJoin from "@/pages/PlayerJoin";
import PlayerSession from "@/pages/PlayerSession";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";

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
          <Route path="/tv/:sessionId" element={<TVLobby />} />
          <Route path="/join/:sessionId" element={<PlayerJoin />} />
          <Route
            path="/session/:sessionId/player/:token"
            element={<PlayerSession />}
          />
          <Route path="/admin" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <p className="text-gray-500">Page not found</p>
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
