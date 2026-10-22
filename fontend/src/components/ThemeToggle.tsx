"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { currentTheme, otherTheme, setTheme, THEME_EVENT, type Theme } from "@/lib/theme";

/*
 * The light / dark button.
 *
 * The first render is always the light appearance (the moon icon) so the static page and
 * the first client render match; the real theme is read straight after mount. Pressing it
 * applies the theme, remembers it and announces it, so every other page and tab follows.
 */
export function ThemeToggle({ className = "theme-toggle" }: { className?: string }) {
  const [theme, setLocalTheme] = useState<Theme>("light");

  useEffect(() => {
    const sync = () => setLocalTheme(currentTheme());
    sync();
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);

  const next = otherTheme(theme);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        setTheme(next);
        setLocalTheme(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === "light" ? <Moon size={19} aria-hidden="true" /> : <Sun size={19} aria-hidden="true" />}
    </button>
  );
}
