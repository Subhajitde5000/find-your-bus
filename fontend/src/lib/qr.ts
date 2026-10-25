import { getRoute, searchRoutes, STOPS, canonicalStop, type Direction } from "./timetables";

/*
 * The QR links.
 *
 * Two stickers exist in the real world:
 *
 *   "on bus"      one per bus route, stuck inside the bus. Scanning it opens the screen
 *                 that works out which stop and which bus the passenger is on.
 *   "at bus stop" one per stop, on the shelter. Scanning it opens that stop's board.
 *
 * Both are plain https URLs on the project's own domain, because that is what makes an
 * installed app open them (Android App Links / iOS Universal Links) while a phone
 * without the app still gets the website. The QR therefore never contains a custom
 * scheme, and never depends on the app being installed.
 *
 * The links are deliberately short: fewer characters is a lower QR version, a coarser
 * grid, and a sticker that still scans when it is scratched, rained on or photographed
 * at an angle from a seat two rows away.
 *
 *   https://<domain>/qr/bus?r=230&d=r&bus=WB12AB3456&from=Exide&to=Garia
 *   https://<domain>/qr/stop?s=Esplanade
 *
 * Everything here is pure string work plus lookups in the bundled directory, so a code
 * can be resolved with no network at all. That is what makes scanning work at the
 * roadside and inside a moving bus.
 */

export const QR_BUS_PATH = "/qr/bus";
export const QR_STOP_PATH = "/qr/stop";

export interface BusQrTarget {
  kind: "bus";
  /** Route number exactly as the directory spells it. */
  route: string;
  /** null when the sticker serves both directions. */
  direction: Direction | null;
  /** Bus registration printed on the sticker, for the future per-bus stickers. */
  busReg: string | null;
  /** Stop the passenger boarded at, when a sticker or a link carries one. */
  boarding: string | null;
  /** Destination the passenger picked when the link was made. */
  destination: string | null;
}

export interface StopQrTarget {
  kind: "stop";
  stop: string;
}

export type QrTarget = BusQrTarget | StopQrTarget;

export interface BusQrOptions {
  route: string;
  direction?: Direction | null;
  busReg?: string | null;
  boarding?: string | null;
  destination?: string | null;
}

/** A base URL with no trailing slash and no path, so links join cleanly. */
export function normaliseOrigin(origin: string): string {
  return (origin ?? "").trim().replace(/\/+$/, "");
}

function put(params: URLSearchParams, key: string, value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (text) params.set(key, text);
}

/** The path-and-query part of an on-bus link; what the app routes internally. */
export function busQrPath(options: BusQrOptions): string {
  const params = new URLSearchParams();
  put(params, "r", options.route);
  if (options.direction === "return") params.set("d", "r");
  else if (options.direction === "outbound") params.set("d", "o");
  put(params, "bus", options.busReg);
  put(params, "from", options.boarding);
  put(params, "to", options.destination);
  const query = params.toString();
  return query ? `${QR_BUS_PATH}?${query}` : QR_BUS_PATH;
}

/** The path-and-query part of a bus-stop link. */
export function stopQrPath(stop: string): string {
  const params = new URLSearchParams();
  put(params, "s", stop);
  const query = params.toString();
  return query ? `${QR_STOP_PATH}?${query}` : QR_STOP_PATH;
}

/** Absolute link for printing into a QR code. */
export function buildBusQrUrl(origin: string, options: BusQrOptions): string {
  return `${normaliseOrigin(origin)}${busQrPath(options)}`;
}

export function buildStopQrUrl(origin: string, stop: string): string {
  return `${normaliseOrigin(origin)}${stopQrPath(stop)}`;
}

/** In-app href for a resolved target. */
export function qrHref(target: QrTarget): string {
  return target.kind === "bus" ? busQrPath(target) : stopQrPath(target.stop);
}

function asDirection(value: string | null): Direction | null {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "r" || text === "return" || text === "back") return "return";
  if (text === "o" || text === "outbound" || text === "forward") return "outbound";
  return null;
}

/** Reads the query of a /qr/... path. Returns null for anything that is not one. */
function fromPath(pathname: string, search: URLSearchParams): QrTarget | null {
  const path = pathname.replace(/\/+$/, "").toLowerCase();
  if (path.endsWith(QR_BUS_PATH)) {
    const route = (search.get("r") ?? search.get("route") ?? "").trim();
    if (!route) return null;
    return {
      kind: "bus",
      route,
      direction: asDirection(search.get("d") ?? search.get("dir")),
      busReg: (search.get("bus") ?? search.get("reg") ?? "").trim() || null,
      boarding: (search.get("from") ?? search.get("stop") ?? "").trim() || null,
      destination: (search.get("to") ?? "").trim() || null,
    };
  }
  if (path.endsWith(QR_STOP_PATH)) {
    const stop = (search.get("s") ?? search.get("stop") ?? "").trim();
    return stop ? { kind: "stop", stop } : null;
  }
  return null;
}

/**
 * Turns whatever came out of a QR camera, a shared link, or the manual entry box into a
 * target. Accepts, in this order:
 *
 *   https://domain/qr/bus?...        an absolute link (the normal case)
 *   /qr/stop?s=...                   a relative link
 *   cholo://bus?r=...                a scheme link, kept for links made before App Links
 *   bus 230 / b:230 / bus:230        the short code printed under the sticker
 *   stop Esplanade / s:Esplanade     the short code for a stop
 *   a bare route number or stop name (resolved against the directory)
 *
 * Returns null when it cannot tell, rather than guessing a wrong bus or stop.
 */
export function resolveQrInput(raw: string): QrTarget | null {
  if (typeof raw !== "string") return null;
  const input = raw.trim();
  if (!input) return null;

  // The cholo: scheme, which older links may still use. It puts the kind in the host.
  if (/^cholo:/i.test(input)) {
    try {
      const parsed = new URL(input.replace(/^cholo:/i, "https:"));
      const host = parsed.hostname.toLowerCase();
      if (host === "bus") return fromPath(QR_BUS_PATH, parsed.searchParams);
      if (host === "stop") return fromPath(QR_STOP_PATH, parsed.searchParams);
      return fromPath(parsed.pathname, parsed.searchParams);
    } catch {
      return null;
    }
  }

  // A URL, absolute or relative.
  if (/^https?:\/\//i.test(input) || input.startsWith("/qr/")) {
    let url: URL;
    try {
      url = input.startsWith("/") ? new URL(input, "https://cholo.invalid") : new URL(input);
    } catch {
      return null;
    }
    return fromPath(url.pathname, url.searchParams);
  }

  // The printed short code.
  const code = input.match(/^(bus|b|stop|s)\s*[:\-|]?\s*(.+)$/i);
  if (code) {
    const kind = code[1].toLowerCase();
    const value = code[2].trim();
    if (!value) return null;
    if (kind === "bus" || kind === "b") {
      const parts = value.split(/\s+/);
      return {
        kind: "bus",
        route: parts[0],
        direction: asDirection(parts[1] ?? null),
        busReg: null,
        boarding: null,
        destination: null,
      };
    }
    return { kind: "stop", stop: value };
  }

  // Bare text: the directory decides, and only when the answer is unambiguous.
  const route = getRoute(input);
  if (route) return { kind: "bus", route: route.number, direction: null, busReg: null, boarding: null, destination: null };
  const stop = canonicalStop(input);
  if (stop && STOPS.includes(stop)) return { kind: "stop", stop };
  return null;
}

/** What to print under a sticker, for somebody whose camera will not focus. */
export function shortCodeFor(target: QrTarget): string {
  if (target.kind === "stop") return `STOP ${target.stop}`;
  const direction = target.direction === "outbound" ? " O" : target.direction === "return" ? " R" : "";
  return `BUS ${target.route}${direction}`;
}

/** Route suggestions for the manual entry box and the admin tool. */
export function routeSuggestions(query: string, limit = 6) {
  return searchRoutes(query, limit);
}

/** True when a link points at this project's QR screens, whatever the domain. */
export function isQrLink(url: string): boolean {
  try {
    const parsed = new URL(url, "https://cholo.invalid");
    return parsed.pathname.replace(/\/+$/, "").toLowerCase().endsWith(QR_BUS_PATH) ||
      parsed.pathname.replace(/\/+$/, "").toLowerCase().endsWith(QR_STOP_PATH);
  } catch {
    return false;
  }
}
