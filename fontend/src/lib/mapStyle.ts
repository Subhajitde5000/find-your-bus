/*
 * The map's day / night style.
 *
 * "auto" follows the phone: it is night when the device asks for a dark appearance. The
 * choice is remembered per device in localStorage, and the map still works when storage is
 * blocked (private windows, some in-app browsers), it just forgets the choice.
 */

export type MapStyle = "auto" | "day" | "night";
export const MAP_STYLE_KEY = "pathsathi-map-style";

export function isMapStyle(value: unknown): value is MapStyle {
  return value === "auto" || value === "day" || value === "night";
}

/** The style to draw: "auto" resolved against the device. */
export function resolveMapStyle(preference: MapStyle, systemDark: boolean): "day" | "night" {
  if (preference === "auto") return systemDark ? "night" : "day";
  return preference;
}

/** The button cycles auto -> day -> night -> auto. */
export function nextMapStyle(preference: MapStyle): MapStyle {
  return preference === "auto" ? "day" : preference === "day" ? "night" : "auto";
}

export function readStoredMapStyle(): MapStyle {
  try {
    const stored = window.localStorage.getItem(MAP_STYLE_KEY);
    return isMapStyle(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function storeMapStyle(preference: MapStyle): void {
  try {
    window.localStorage.setItem(MAP_STYLE_KEY, preference);
  } catch {
    /* storage blocked: the choice lasts until the page closes */
  }
}
