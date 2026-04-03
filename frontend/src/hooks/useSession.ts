import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => api.getSession(sessionId!),
    enabled: !!sessionId,
    refetchInterval: 10_000,
  });
}

export function usePlayerSession(
  sessionId: string | undefined,
  token: string | undefined,
  pollInterval?: number,
) {
  return useQuery({
    queryKey: ["player", sessionId, token],
    queryFn: () => api.getPlayerSession(sessionId!, token!),
    enabled: !!sessionId && !!token,
    refetchInterval: pollInterval ?? false,
  });
}
