import { useEffect, useState } from "react";
import { api, ClubThemeResponse } from "@/api/client";

const DEFAULT_THEME: ClubThemeResponse = {
  logo_url: null,
  primary_color: "#d4a937",
  accent_color: "#1a5c38",
  bg_color: "#0f1419",
  text_color: "#e5e7eb",
  bg_image_url: null,
  font_family: "Inter",
  tv_layout: "classic",
};

/**
 * Fetches a club's theme and applies CSS custom properties to the document root.
 * Used by player and TV pages to render with the club's branding.
 */
export function useClubTheme(clubId: string | undefined): ClubThemeResponse {
  const [theme, setTheme] = useState<ClubThemeResponse>(DEFAULT_THEME);

  useEffect(() => {
    if (!clubId) return;
    let cancelled = false;
    api
      .getClubTheme(clubId)
      .then((t) => {
        if (cancelled) return;
        setTheme(t);
      })
      .catch(() => {
        // Use defaults on error
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--club-primary", theme.primary_color);
    root.style.setProperty("--club-accent", theme.accent_color);
    root.style.setProperty("--club-bg", theme.bg_color);
    root.style.setProperty("--club-text", theme.text_color);
    root.style.setProperty("--club-font", theme.font_family);
    if (theme.bg_image_url) {
      root.style.setProperty("--club-bg-image", `url(${theme.bg_image_url})`);
    } else {
      root.style.removeProperty("--club-bg-image");
    }
  }, [theme]);

  return theme;
}
