import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";

export function useSession(clubId: string | undefined, sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session", clubId, sessionId],
    queryFn: () => api.getSession(clubId!, sessionId!),
    enabled: !!clubId && !!sessionId,
    refetchInterval: 10_000,
  });
}

export function usePlayerSession(
  clubId: string | undefined,
  sessionId: string | undefined,
  token: string | undefined,
  pollInterval?: number,
) {
  return useQuery({
    queryKey: ["player", clubId, sessionId, token],
    queryFn: () => api.getPlayerSession(clubId!, sessionId!, token!),
    enabled: !!clubId && !!sessionId && !!token,
    refetchInterval: pollInterval ?? false,
  });
}
