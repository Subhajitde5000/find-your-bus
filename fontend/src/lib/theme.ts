/*
 * The site's light / dark appearance.
 *
 * The choice lives on <html data-theme="...">, because every colour in globals.css is a
 * variable hanging off that attribute. It is remembered per device in localStorage; when
 * nothing is stored the phone's own appearance decides.
 *
 * The choice is read in one place (the bootstrap script in app/layout.tsx) so *every* page
 * paints in the right colours, not just the page that happens to own the theme button.
 * Before this, only the home page applied the theme, so opening /map directly (or after a
 * reload) dropped back to the light background while the map itself stayed night.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "cholo-theme";
/** Fired on window whenever the theme changes, so buttons elsewhere on the page can follow. */
export const THEME_EVENT = "cholo:theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function otherTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

export function themeFromSystem(prefersDark: boolean): Theme {
  return prefersDark ? "dark" : "light";
}

export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : null;
  } catch {
    /* storage blocked (private windows, some in-app browsers): fall back to the phone */
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}

export function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  } catch {
    return false;
  }
}

/** The theme the page should paint: the stored choice, else the phone's appearance. */
export function preferredTheme(): Theme {
  return readStoredTheme() ?? themeFromSystem(systemPrefersDark());
}

/** The theme the page is painting right now. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const theme = document.documentElement.getAttribute("data-theme");
  return isTheme(theme) ? theme : preferredTheme();
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/** Applies, remembers and announces a theme chosen by the reader. */
export function setTheme(theme: Theme): void {
  applyTheme(theme);
  storeTheme(theme);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
  }
}

/** The script that runs before the first paint in app/layout.tsx. Kept in sync with the helpers above. */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light");}catch(e){}})();`;
