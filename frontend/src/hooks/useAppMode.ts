import { useLocation } from "react-router-dom";

export type AppMode = "admin" | "owner";

/**
 * Detects admin vs owner mode from the current URL path.
 * Returns the mode and the base path for club-scoped navigation.
 *
 * Admin: /admin/clubs/:clubId -> basePath = "/admin/clubs/:clubId"
 * Owner: /owner/club/:clubId  -> basePath = "/owner/club/:clubId"
 */
export function useAppMode(clubId: string | undefined): {
  mode: AppMode;
  basePath: string;
  loginPath: string;
} {
  const { pathname } = useLocation();
  const isOwner = pathname.startsWith("/owner");

  return {
    mode: isOwner ? "owner" : "admin",
    basePath: isOwner ? `/owner/club/${clubId}` : `/admin/clubs/${clubId}`,
    loginPath: isOwner ? "/owner" : "/admin",
  };
}
