import dataset from "@/data/kolkata-bus-data.json";
import { haversineMetres, isValidPosition, type Position } from "./geo";

/*
 * Every stop in the bundle, with the buses that call at it.
 *
 * This is the data behind the network map: "which stop is nearest to me", "which buses
 * stop here" and the stop search. Pure functions over the bundled dataset, no network.
 *
 * Nothing is invented. A stop with no published position is searchable and its buses are
 * listed, but it has no place on the map and is never offered as the "nearest" stop.
 */

export interface RawStop {
  name: string;
  lat?: number;
  lng?: number;
  coordConfidence?: string;
}

export interface RawRoute {
  number: string;
  source?: string;
  operator?: string;
  type?: string;
  origin: string;
  destination: string;
  stops: string[];
  runs?: unknown[] | null;
  frequency?: unknown;
}

export interface BusAtStop {
  number: string;
  type: string;
  operator: string;
  origin: string;
  destination: string;
  /** True when the route has a published timetable, so the ride screen has real times. */
  timed: boolean;
  /** Where in the route's stop list this stop sits (0 = first). */
  position: number;
  stopCount: number;
}

export interface IndexedStop {
  name: string;
  position: Position | null;
  confidence: string | null;
  buses: BusAtStop[];
}

export interface NearStop {
  stop: IndexedStop;
  metres: number;
}

export interface StopIndex {
  stops: IndexedStop[];
  byName: Map<string, IndexedStop>;
  located: IndexedStop[];
}

/** "2", "10", "10A", "C12": numbers first, then the suffix. */
export function compareRouteNumbers(a: string, b: string): number {
  return a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
}

export function createStopIndex(rawStops: RawStop[], rawRoutes: RawRoute[]): StopIndex {
  const byName = new Map<string, IndexedStop>();
  for (const raw of rawStops) {
    if (!raw || typeof raw.name !== "string" || !raw.name || byName.has(raw.name)) continue;
    const candidate = { lat: raw.lat as number, lng: raw.lng as number };
    byName.set(raw.name, {
      name: raw.name,
      position: isValidPosition(candidate) ? candidate : null,
      confidence: raw.coordConfidence ?? null,
      buses: [],
    });
  }
  for (const route of rawRoutes) {
    const timed = Boolean((route.runs && route.runs.length) || route.frequency);
    const seen = new Set<string>();
    route.stops.forEach((name, position) => {
      // A route can name a stop twice (a loop). It is one bus at that stop, not two.
      if (seen.has(name)) return;
      seen.add(name);
      let stop = byName.get(name);
      if (!stop) {
        stop = { name, position: null, confidence: null, buses: [] };
        byName.set(name, stop);
      }
      stop.buses.push({
        number: route.number,
        type: route.type ?? "Non-AC",
        operator: route.operator ?? "",
        origin: route.origin,
        destination: route.destination,
        timed,
        position,
        stopCount: route.stops.length,
      });
    });
  }
  const stops = [...byName.values()];
  for (const stop of stops) {
    // Timetabled buses first (the ride screen has real times for them), then by number.
    stop.buses.sort((a, b) => Number(b.timed) - Number(a.timed) || compareRouteNumbers(a.number, b.number));
  }
  return { stops, byName, located: stops.filter((stop) => stop.position !== null) };
}

/** The buses that call at a stop, or an empty list for a name nobody calls at. */
export function busesAt(index: StopIndex, name: string): BusAtStop[] {
  return index.byName.get(name)?.buses ?? [];
}

/**
 * The nearest located stops to a position, closest first.
 *
 * `maxMetres` keeps "nearest" honest: a phone 30 km outside the mapped city has no
 * nearest stop worth showing, and saying so is better than naming one.
 */
export function nearestStops(
  index: StopIndex,
  position: Position,
  options: { limit?: number; maxMetres?: number; withBusesOnly?: boolean } = {},
): NearStop[] {
  const limit = options.limit ?? 5;
  const maxMetres = options.maxMetres ?? 3000;
  const found: NearStop[] = [];
  for (const stop of index.located) {
    if (options.withBusesOnly && !stop.buses.length) continue;
    const metres = haversineMetres(stop.position as Position, position);
    if (metres <= maxMetres) found.push({ stop, metres });
  }
  found.sort((a, b) => a.metres - b.metres || a.stop.name.localeCompare(b.stop.name));
  return found.slice(0, limit);
}

/** Lower-case, accents and punctuation out, spaces collapsed: what search compares. */
export function normaliseName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export interface StopHit {
  stop: IndexedStop;
  /** 0 = whole name equals the query, 1 = name starts with it, 2 = a word starts with it, 3 = contains it. */
  rank: number;
}

/**
 * Stops whose name matches the query. Better matches first; within a rank, the stops with
 * a place on the map and more buses come first, because that is the one a person means.
 */
export function searchStops(index: StopIndex, query: string, limit = 8): StopHit[] {
  const needle = normaliseName(query);
  if (!needle) return [];
  const hits: StopHit[] = [];
  for (const stop of index.stops) {
    const name = normaliseName(stop.name);
    let rank = -1;
    if (name === needle) rank = 0;
    else if (name.startsWith(needle)) rank = 1;
    else if (name.split(" ").some((word) => word.startsWith(needle))) rank = 2;
    else if (name.includes(needle)) rank = 3;
    if (rank >= 0) hits.push({ stop, rank });
  }
  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      Number(b.stop.position !== null) - Number(a.stop.position !== null) ||
      b.stop.buses.length - a.stop.buses.length ||
      a.stop.name.localeCompare(b.stop.name),
  );
  return hits.slice(0, limit);
}

/** The index of the bundled dataset, built once. */
export const STOP_INDEX: StopIndex = createStopIndex(
  (dataset as unknown as { stops: RawStop[] }).stops,
  (dataset as unknown as { routes: RawRoute[] }).routes,
);

/** Stop names of each route, in route order, by route number. Route numbers are unique in the bundle. */
export const ROUTE_STOPS: Map<string, string[]> = new Map(
  (dataset as unknown as { routes: RawRoute[] }).routes.map((route) => [route.number, route.stops]),
);
