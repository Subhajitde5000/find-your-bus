"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { nextMapStyle, readStoredMapStyle, resolveMapStyle, storeMapStyle, type MapStyle } from "@/lib/mapStyle";

/** True when the page or the device is in a dark appearance. */
function systemIsDark(): boolean {
  try {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme === "dark") return true;
    if (theme === "light") return false;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  } catch {
    return false;
  }
}

/**
 * The map's day / night choice. The first render is always "day" so the static page and
 * the first client render match; the stored choice is applied right after.
 */
export function useMapStyle(): { preference: MapStyle; style: "day" | "night"; cycle: () => void } {
  const [preference, setPreference] = useState<MapStyle>("auto");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // The stored choice and the device appearance only exist in the browser, so they are read
    // after the first render (which must match the static page), not during it.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPreference(readStoredMapStyle());
    setDark(systemIsDark());
    /* eslint-enable react-hooks/set-state-in-effect */
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const sync = () => setDark(systemIsDark());
    query?.addEventListener?.("change", sync);
    const observer = typeof MutationObserver !== "undefined" ? new MutationObserver(sync) : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      query?.removeEventListener?.("change", sync);
      observer?.disconnect();
    };
  }, []);

  const cycle = () => {
    const next = nextMapStyle(preference);
    setPreference(next);
    storeMapStyle(next);
  };
  return { preference, style: resolveMapStyle(preference, dark), cycle };
}

const LABEL: Record<MapStyle, string> = { auto: "Map style: automatic", day: "Map style: day", night: "Map style: night" };

export function MapStyleToggle({ preference, onCycle }: { preference: MapStyle; onCycle: () => void }) {
  const Icon = preference === "night" ? Moon : preference === "day" ? Sun : SunMoon;
  return (
    <button type="button" onClick={onCycle} aria-label={`${LABEL[preference]}. Tap to change.`} title={LABEL[preference]}>
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}
