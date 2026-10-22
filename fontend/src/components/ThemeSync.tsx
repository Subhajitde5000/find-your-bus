"use client";

import { useEffect } from "react";
import { applyTheme, preferredTheme, THEME_EVENT } from "@/lib/theme";

/*
 * Keeps <html data-theme> true to the reader's choice on every page.
 *
 * The first paint is handled by the bootstrap script in app/layout.tsx (so there is no
 * flash of the wrong background). This component handles what happens afterwards: the
 * phone switching to dark at sunset, another tab changing the theme, or a theme button
 * on this page being pressed.
 */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => applyTheme(preferredTheme());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    window.addEventListener("storage", sync);
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    query?.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener(THEME_EVENT, sync);
      window.removeEventListener("storage", sync);
      query?.removeEventListener?.("change", sync);
    };
  }, []);

  return null;
}
