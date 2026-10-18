/*
 * Geometry for the offline ride screen.
 *
 * Everything here is a pure function on numbers: no browser APIs, no network, no
 * state. That is deliberate, so the whole matching engine can be unit tested and so
 * the same code runs the same way in a service worker, a web worker or a test.
 *
 * Distances are great-circle (haversine) for stop to stop, and a local flat
 * projection for the short "how far am I from this bus stop" measurements, where the
 * curvature of the earth is irrelevant and the flat maths is exact enough.
 */

export interface Position {
  lat: number;
  lng: number;
}

/** A reading from the Geolocation API, with how much to trust it. */
export interface GeoFix extends Position {
  /** Reported accuracy in metres. Smaller is better; 0 means the device did not say. */
  accuracy: number;
  /** Milliseconds since the epoch, from the fix itself rather than from `Date.now()`. */
  timestamp: number;
}

export const EARTH_RADIUS_METRES = 6_371_000;

/**
 * A generous box around West Bengal and the districts the intercity routes reach.
 * A fix outside it is a bad reading, not a journey: Siliguri is the northern edge
 * and the Sundarbans the southern one.
 */
export const SERVICE_AREA = { minLat: 21.0, maxLat: 27.5, minLng: 86.0, maxLng: 90.0 };

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function isValidPosition(value: unknown): value is Position {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Position>;
  return (
    typeof candidate.lat === "number" &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lat) &&
    Number.isFinite(candidate.lng)
  );
}

/**
 * True when a position is inside the area this guide covers.
 *
 * This is a geography test only: a fix in Bengaluru is not a Kolkata bus ride. How much
 * to trust a fix is a separate question — the ride tracker weighs `accuracy` itself,
 * because "not good enough to place you at a stop" is a judgement about the route, not
 * about the map.
 */
export function isPlausibleFix(fix: unknown): boolean {
  if (!isValidPosition(fix)) return false;
  const { lat, lng } = fix;
  if (lat < SERVICE_AREA.minLat || lat > SERVICE_AREA.maxLat) return false;
  if (lng < SERVICE_AREA.minLng || lng > SERVICE_AREA.maxLng) return false;
  return true;
}

/** Straight-line distance in metres. */
export function haversineMetres(a: Position, b: Position): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing in degrees, 0 = north. Used to tell which way the bus is heading. */
export function bearingDegrees(a: Position, b: Position): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

/**
 * One leg of the corridor: two consecutive located stops and the line between them.
 * `fromStop` and `toStop` are indexes into the ride's stop list.
 */
export interface CorridorSegment {
  fromStop: number;
  toStop: number;
  /** The road from the first stop to the second, or the two stops when none is known. */
  points: Position[];
  /** Length of `points`, which is the road's length rather than the gap between stops. */
  metres: number;
  /** Metres along the whole corridor at the start of this segment. */
  startMetres: number;
}

/**
 * Where a point falls relative to one segment.
 *
 * `t` is clamped to 0..1, so a point beyond the end of the leg is measured from the
 * nearer endpoint instead of from an imaginary extended line. That matters at the two
 * ends of a route, where the bus is genuinely off the corridor.
 */
export interface Projection {
  /** 0 at `from`, 1 at `to`. */
  t: number;
  /** Distance in metres from the point to the segment. */
  offsetMetres: number;
  /** Distance in metres along the segment to the nearest point on it. */
  alongMetres: number;
  /** The nearest point on the segment. */
  point: Position;
}

/** Projects `point` onto the segment a-b on a flat local tangent plane, in metres. */
export function projectOntoSegment(from: Position, to: Position, point: Position): Projection {
  const cosLat = Math.cos(toRadians((from.lat + to.lat) / 2));
  const metresPerDegreeLat = toRadians(1) * EARTH_RADIUS_METRES;
  const metresPerDegreeLng = metresPerDegreeLat * cosLat;
  const bx = (to.lng - from.lng) * metresPerDegreeLng;
  const by = (to.lat - from.lat) * metresPerDegreeLat;
  const px = (point.lng - from.lng) * metresPerDegreeLng;
  const py = (point.lat - from.lat) * metresPerDegreeLat;
  const lengthSquared = bx * bx + by * by;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (px * bx + py * by) / lengthSquared));
  const nearestX = t * bx;
  const nearestY = t * by;
  const length = Math.sqrt(lengthSquared);
  return {
    t,
    offsetMetres: Math.hypot(px - nearestX, py - nearestY),
    alongMetres: t * length,
    point: { lat: from.lat + t * (to.lat - from.lat), lng: from.lng + t * (to.lng - from.lng) },
  };
}

/** Distance in metres from `point` to the segment a-b. */
export function crossTrackMetres(from: Position, to: Position, point: Position): number {
  return projectOntoSegment(from, to, point).offsetMetres;
}

/** Total length in metres of a chain of points. */
export function corridorMetres(points: Position[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMetres(points[index - 1], points[index]);
  }
  return total;
}

/**
 * Projects `point` onto a polyline, the way the corridor needs it.
 *
 * The projection is the nearest one over all the sub-segments, and `alongMetres` is
 * measured from the start of the whole line rather than from the sub-segment that won.
 * That is what lets the ride engine keep one distance-along-the-route for a road that
 * bends: without it, the bus would appear to jump backwards at every corner.
 */
export function projectOntoPolyline(points: Position[], point: Position): Projection | null {
  if (!points.length) return null;
  if (points.length === 1) {
    return { t: 0, offsetMetres: haversineMetres(points[0], point), alongMetres: 0, point: points[0] };
  }

  const cumulative = [0];
  for (let index = 1; index < points.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineMetres(points[index - 1], points[index]));
  }
  const total = cumulative[cumulative.length - 1];

  let bestOffset = Infinity;
  let bestAlong = 0;
  let bestPoint = points[0];
  for (let index = 1; index < points.length; index += 1) {
    const projection = projectOntoSegment(points[index - 1], points[index], point);
    if (projection.offsetMetres < bestOffset) {
      bestOffset = projection.offsetMetres;
      bestAlong = Math.min(cumulative[index - 1] + projection.alongMetres, total);
      bestPoint = projection.point;
    }
  }
  return {
    t: total === 0 ? 0 : bestAlong / total,
    offsetMetres: bestOffset,
    alongMetres: bestAlong,
    point: bestPoint,
  };
}

/**
 * The first `metres` of a polyline, ending exactly at that distance.
 *
 * The map draws the travelled part of the route with this, so it ends at the same
 * point the passenger's marker is drawn at. A distance past the end returns the whole
 * line; one before the start returns its first point.
 */
export function slicePolyline(points: Position[], metres: number): Position[] {
  if (!points.length) return [];
  if (metres <= 0 || points.length === 1) return [points[0]];

  const sliced = [points[0]];
  let travelled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const leg = haversineMetres(points[index - 1], points[index]);
    if (travelled + leg < metres) {
      sliced.push(points[index]);
      travelled += leg;
      continue;
    }
    const ratio = leg === 0 ? 0 : (metres - travelled) / leg;
    if (ratio > 0) {
      sliced.push({
        lat: points[index - 1].lat + (points[index].lat - points[index - 1].lat) * ratio,
        lng: points[index - 1].lng + (points[index].lng - points[index - 1].lng) * ratio,
      });
    }
    return sliced;
  }
  return sliced;
}

/**
 * "450 m" or "2.3 km", rounded the way a passenger would say it.
 *
 * The switch to kilometres is decided in whole tenths, integer arithmetic throughout.
 * Dividing first and formatting after turns 950 m into "0.9 km", because 0.95 is not
 * representable exactly and rounds down; nobody calls a kilometre "nine-tenths".
 */
export function formatDistance(metres: number): string {
  if (!Number.isFinite(metres) || metres < 0) return "—";
  const tenths = Math.round(metres / 100);
  if (tenths < 10) return `${Math.round(metres / 10) * 10} m`;
  return `${(tenths / 10).toFixed(tenths < 995 ? 1 : 0)} km`;
}

/** "12 min" / "1 hr 20 min", for the ride screen rather than for a timetable. */
export function formatRideMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  const rounded = Math.max(1, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** Average speed in metres per second over a leg, for the estimate fallback. */
export function speedMps(metres: number, minutes: number): number {
  if (minutes <= 0) return 0;
  return metres / (minutes * 60);
}
