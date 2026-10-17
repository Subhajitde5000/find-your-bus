import dataset from "@/data/kolkata-bus-data.json";
import type { Position } from "./geo";

/*
 * Stop coordinates, straight from the bundled dataset.
 *
 * The positions are written into `src/data/kolkata-bus-data.json` by
 * `scripts/build_static_data.py`, which merges the reviewed table
 * `data/stop_coordinates.json` produced by `scripts/geocode_stops.py`. They are copied
 * from openly published datasets (OpenStreetMap via arkodeepg/calcutta-transport, and
 * the BusJatri town list) and checked against the route chains; the provenance and the
 * confidence of each one are recorded in `data/STOP_COORDINATE_AUDIT.md`.
 *
 * A stop with no coordinate is not given one here. `stopPosition` returns null and the
 * ride screen skips that stop, because a wrong position is worse than a missing one.
 */

export type CoordConfidence = "high" | "medium" | "review";

interface RawStop {
  name: string;
  stand: string | null;
  lat?: number;
  lng?: number;
  coordConfidence?: CoordConfidence;
}

interface RawMeta {
  counts?: Record<string, number>;
  coordinates?: {
    source?: string | null;
    licence?: string;
    confidence?: Record<string, number>;
    notLocated?: string[];
  };
}

const RAW_STOPS = (dataset as { stops?: RawStop[] }).stops ?? [];
const META = (dataset as { meta?: RawMeta }).meta ?? {};

const POSITIONS = new Map<string, Position>();
export const STOP_COORD_CONFIDENCE = new Map<string, CoordConfidence>();

for (const stop of RAW_STOPS) {
  if (typeof stop?.lat !== "number" || typeof stop?.lng !== "number") continue;
  if (!Number.isFinite(stop.lat) || !Number.isFinite(stop.lng)) continue;
  POSITIONS.set(stop.name, { lat: stop.lat, lng: stop.lng });
  if (stop.coordConfidence) STOP_COORD_CONFIDENCE.set(stop.name, stop.coordConfidence);
}

/**
 * The mapped position of a stop, or null.
 *
 * Exact names only. The dataset already merges the spellings it is sure about, and
 * inventing a looser match here is how a stop ends up in the wrong district.
 */
export function stopPosition(name: unknown): Position | null {
  if (typeof name !== "string" || !name) return null;
  return POSITIONS.get(name) ?? null;
}

/** How many of a list of stop names have a position. */
export function locatedCount(names: string[]): number {
  return names.reduce((total, name) => total + (POSITIONS.has(name) ? 1 : 0), 0);
}

/** True when a route has enough mapped stops to follow at all. */
export function isRideable(names: string[]): boolean {
  return locatedCount(names) >= 2;
}

/** Coverage numbers for the UI and the tests, read from the dataset's own metadata. */
export const COORDINATE_STATS = {
  stops: META.counts?.stops ?? RAW_STOPS.length,
  located: META.counts?.stopsLocated ?? POSITIONS.size,
  routesRideable: META.counts?.routesRideable ?? 0,
  routes: META.counts?.routes ?? 0,
  timedRoutesRideable: META.counts?.timedRoutesRideable ?? 0,
  high: META.coordinates?.confidence?.high ?? 0,
  medium: META.coordinates?.confidence?.medium ?? 0,
  review: META.coordinates?.confidence?.review ?? 0,
  source: META.coordinates?.source ?? null,
  licence: META.coordinates?.licence ?? "",
};
