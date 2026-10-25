/*
 * The QR code link format, in one place.
 *
 * Every QR sticker the project prints is a plain https link to this website:
 *
 *   on a bus:      /on-bus?route=1               (optionally &bus=WB04A1234, later)
 *   at a stop:     /stop?stop=Esplanade
 *
 * Plain links, not a custom scheme (`cholo://`), because that is the only thing that
 * works for everyone:
 *   - on a phone with the Cholo app installed, Android App Links and iOS Universal
 *     Links open the link in the app (see `public/.well-known/` and the native
 *     projects' manifests);
 *   - on a phone without the app, it opens this website, which needs no install;
 *   - a printed link never expires and never depends on our servers:
 *     the timetable is inside the app and in the site bundle.
 *
 * The domain is therefore permanent once a sticker is on a bus. It lives in exactly
 * one constant, `SITE_ORIGIN`, and `scripts/set_qr_domain.mjs` rewrites it (and the
 * native association files that must repeat it) everywhere at once.
 */

export const SITE_ORIGIN = "https://cholo.example";

export const ON_BUS_PATH = "/on-bus";
export const STOP_PATH = "/stop";

/** A QR stuck inside one bus of one route. */
export interface OnBusQr {
  kind: "on-bus";
  /** The route number as printed in the directory, e.g. "1", "AC5", "S12D". */
  route: string;
  /**
   * The bus's registration number, e.g. "WB04A1234".
   *
   * Not printed yet: the first stickers identify the route only and the bus is worked
   * out from the passenger's position and the timetable. The link accepts it now so
   * that stickers printed later can name the exact bus without changing the address.
   */
  bus: string | null;
}

/** A QR stuck at one bus stop. */
export interface StopQr {
  kind: "stop";
  /** The stop's exact name in the directory, e.g. "B.B.D. Bagh". */
  stop: string;
}

export type QrTarget = OnBusQr | StopQr;

export type QrFailure =
  | "empty"
  | "not-a-link"
  | "other-website"
  | "unknown-page"
  | "missing-route"
  | "missing-stop";

export type QrParse = { ok: true; target: QrTarget; path: string; warnings: string[] } | { ok: false; reason: QrFailure };

/** "https://x/" -> "https://x", so links never end up with a double slash. */
export function normaliseOrigin(origin: string): string {
  return origin.trim().replace(/\/+$/, "");
}

const hostOf = (origin: string): string =>
  normaliseOrigin(origin)
    .replace(/^[a-z]+:\/\//i, "")
    .replace(/:\d+$/, "")
    .toLowerCase();

/** Hosts a printed sticker legitimately uses: the site, its www alias, and local dev. */
function acceptedHosts(origin: string): Set<string> {
  const host = hostOf(origin);
  const hosts = new Set<string>([host]);
  if (host.startsWith("www.")) hosts.add(host.slice(4));
  else hosts.add(`www.${host}`);
  // Development links are useful to keep working on a phone in a workshop.
  hosts.add("localhost");
  hosts.add("127.0.0.1");
  return hosts;
}

/** `WB 04 A 1234`, `WB-04-AF-1234` and `wb04a1234` all describe one bus. */
export function normaliseBusRegistration(value: string): string | null {
  const compact = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  if (!/^[A-Z]{2}\d{1,2}[A-Z]{1,3}\d{1,4}$/.test(compact)) return null;
  // Print it the way a conductor writes it: state, district, series, number.
  const parts = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/.exec(compact);
  if (!parts) return null;
  return `${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}`;
}

/**
 * A route number as it may appear in a QR.
 *
 * Most directory numbers are short and alphanumeric ("1", "10A", "AC5", "S12D"), but a
 * few carry the operator's whole description ("AC-12 (Shapooji Housing (Sukho Brishti)
 * - Howrah Railway Station)"). Those are still valid route numbers, so the validation
 * allows the characters that actually occur in the directory and nothing else: no
 * quotes, no control characters, no markup, and a hard length cap.
 */
export function normaliseRouteNumber(value: string): string | null {
  const route = typeof value === "string" ? value.trim() : "";
  if (!route || route.length > 120) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9 .\-/_()]*$/.test(route)) return null;
  return route;
}

/** A stop name is only ever compared with the directory; it is not a slug. */
function validStopName(value: string): string | null {
  const stop = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!stop || stop.length > 90) return null;
  // Control characters never appear in a stop name and would only make a QR confusing.
  if (/[\u0000-\u001f\u007f]/.test(stop)) return null;
  return stop;
}

/** The path + query for a sticker, the part that is the same on every domain. */
export function qrPath(target: QrTarget): string {
  if (target.kind === "on-bus") {
    const params = new URLSearchParams({ route: normaliseRouteNumber(target.route) ?? target.route.trim() });
    const bus = target.bus ? normaliseBusRegistration(target.bus) : null;
    if (bus) params.set("bus", bus);
    return `${ON_BUS_PATH}?${params.toString()}`;
  }
  const params = new URLSearchParams({ stop: target.stop.trim().replace(/\s+/g, " ") });
  return `${STOP_PATH}?${params.toString()}`;
}

/** The absolute link encoded in the QR, e.g. https://cholo.example/on-bus?route=1 */
export function qrLink(target: QrTarget, origin: string = SITE_ORIGIN): string {
  return `${normaliseOrigin(origin)}${qrPath(target)}`;
}

export function onBusLink(route: string, bus?: string | null, origin: string = SITE_ORIGIN): string {
  return qrLink({ kind: "on-bus", route, bus: bus ?? null }, origin);
}

export function stopLink(stop: string, origin: string = SITE_ORIGIN): string {
  return qrLink({ kind: "stop", stop }, origin);
}

/**
 * Reads a scanned or pasted value and says what it points at.
 *
 * Deliberately strict about the website, because a QR on a bus is trusted input: a
 * sticker from another website must not be able to send the app anywhere it likes.
 * Bare paths ("/on-bus?route=1") are accepted too, which is what a share sheet or a
 * hand-typed link looks like.
 */
export function parseQrValue(value: string, origin: string = SITE_ORIGIN): QrParse {
  const raw = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!raw) return { ok: false, reason: "empty" };

  let url: URL;
  if (raw.startsWith("/")) {
    // A path, as if it were on this site. Give URL a base it can always parse.
    try {
      url = new URL(raw, normaliseOrigin(origin));
    } catch {
      return { ok: false, reason: "not-a-link" };
    }
  } else {
    let candidate = raw;
    // QR encoders sometimes omit the scheme for a bare domain; only https is accepted.
    if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(candidate)) candidate = `https://${candidate}`;
    try {
      url = new URL(candidate);
    } catch {
      return { ok: false, reason: "not-a-link" };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "not-a-link" };
    if (!acceptedHosts(origin).has(url.hostname.toLowerCase())) return { ok: false, reason: "other-website" };
  }

  const path = url.pathname.replace(/\/+$/, "").toLowerCase() || "/";
  const params = url.searchParams;
  const warnings: string[] = [];

  if (path === ON_BUS_PATH) {
    const route = normaliseRouteNumber(params.get("route") ?? params.get("r") ?? "");
    if (!route) return { ok: false, reason: "missing-route" };
    let bus: string | null = null;
    const printed = params.get("bus") ?? params.get("reg") ?? "";
    if (printed.trim()) {
      bus = normaliseBusRegistration(printed);
      if (!bus) warnings.push(`Ignored a bus number that is not an Indian registration: ${printed.trim()}`);
    }
    const target: OnBusQr = { kind: "on-bus", route, bus };
    return { ok: true, target, path: qrPath(target), warnings };
  }

  if (path === STOP_PATH) {
    const stop = validStopName(params.get("stop") ?? params.get("s") ?? "");
    if (!stop) return { ok: false, reason: "missing-stop" };
    const target: StopQr = { kind: "stop", stop };
    return { ok: true, target, path: qrPath(target), warnings };
  }

  return { ok: false, reason: "unknown-page" };
}

/** A sentence for the failures above, for the scanner screen. */
export function qrFailureMessage(reason: QrFailure): string {
  switch (reason) {
    case "empty":
      return "There was nothing in that code.";
    case "not-a-link":
      return "That code is not a link.";
    case "other-website":
      return "That QR code belongs to another website, not to Cholo.";
    case "unknown-page":
      return "That is a Cholo link, but not a bus or bus-stop code.";
    case "missing-route":
      return "That bus code has no route number in it.";
    case "missing-stop":
      return "That bus-stop code has no stop name in it.";
  }
}
