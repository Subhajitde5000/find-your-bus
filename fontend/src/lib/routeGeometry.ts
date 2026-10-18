import geometry from "@/data/route-geometry.json";
import { SERVICE_AREA, isValidPosition, type Position } from "./geo";

/*
 * The road shape between consecutive stops, straight from the bundled dataset.
 *
 * `scripts/build_route_geometry.py` routes every leg of every timed route over an
 * OpenStreetMap road network once, simplifies it, and writes the result to
 * `src/data/route-geometry.json`; this module is the only thing that reads it, so the
 * ride engine and the map see one line each and the app still makes no network call.
 *
 * Keys are directional -- "Howrah Railway Station|Babughat" and "Babughat|Howrah
 * Railway Station" are separate legs, because a divided road or a one-way street sends
 * the bus round a different block in each direction.
 *
 * A leg with no entry is not an error. The intercity stops beyond the road export have
 * no shape, and for those the ride engine and the map fall back to a straight line,
 * which the screen says out loud rather than pretending otherwise. That is why
 * `legGeometry` returns null instead of throwing.
 */

interface RawLeg {
  p?: unknown;
}

/** Coordinates are checked as they are read: a bad point would move the whole line. */
function readPoints(raw: unknown): Position[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const points: Position[] = [];
  for (const item of raw) {
    if (!Array.isArray(item)) return null;
    const position = { lat: item[0], lng: item[1] };
    if (!isValidPosition(position)) return null;
    if (position.lat < SERVICE_AREA.minLat || position.lat > SERVICE_AREA.maxLat) return null;
    if (position.lng < SERVICE_AREA.minLng || position.lng > SERVICE_AREA.maxLng) return null;
    points.push(position);
  }
  return points;
}

const LEGS = new Map<string, Position[]>();
for (const [key, leg] of Object.entries((geometry as { legs?: Record<string, RawLeg> }).legs ?? {})) {
  if (!key.includes("|")) continue;
  const points = readPoints(leg?.p);
  if (points) LEGS.set(key, points);
}

/**
 * The road from one stop to the next, first point at `from` and last at `to`, or null
 * when no road shape is bundled for that leg. Exact names only; they are the keys the
 * dataset and the generator already use.
 */
export function legGeometry(from: string, to: string): Position[] | null {
  return LEGS.get(`${from}|${to}`) ?? null;
}
