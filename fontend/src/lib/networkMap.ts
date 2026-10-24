import { legGeometry } from "./routeGeometry";
import { stopPosition } from "./coords";
import type { Position } from "./geo";

/*
 * The geometry behind the all-stops map at /map.
 *
 * One fixed drawing of greater Kolkata. Every stop, road and landmark is placed with the
 * same affine transform as the route map uses (equirectangular, cosine-corrected), so the
 * two maps agree. Stops outside the window are intercity stops: they are searchable but not
 * drawn, and the page says so rather than squeezing 300 km into a phone screen.
 */

/** Greater Kolkata: Howrah to Salt Lake, Dum Dum to Garia, Behala and beyond. */
export const CITY_WINDOW = { minLat: 22.3, maxLat: 22.85, minLng: 88.15, maxLng: 88.6 };
export const UNITS_PER_KM = 11;
export const KM_PER_DEGREE_LAT = 110.574;
export const KM_PER_DEGREE_LNG = 111.32;
const PADDING = 8;

export function inCityWindow(position: Position): boolean {
  return (
    position.lat >= CITY_WINDOW.minLat &&
    position.lat <= CITY_WINDOW.maxLat &&
    position.lng >= CITY_WINDOW.minLng &&
    position.lng <= CITY_WINDOW.maxLng
  );
}

const COS_LAT = Math.cos((((CITY_WINDOW.minLat + CITY_WINDOW.maxLat) / 2) * Math.PI) / 180);

export const NETWORK_SIZE = {
  width: (CITY_WINDOW.maxLng - CITY_WINDOW.minLng) * KM_PER_DEGREE_LNG * COS_LAT * UNITS_PER_KM + PADDING * 2,
  height: (CITY_WINDOW.maxLat - CITY_WINDOW.minLat) * KM_PER_DEGREE_LAT * UNITS_PER_KM + PADDING * 2,
};

export function networkXY(position: Position): { x: number; y: number } {
  return {
    x: PADDING + (position.lng - CITY_WINDOW.minLng) * KM_PER_DEGREE_LNG * COS_LAT * UNITS_PER_KM,
    y: NETWORK_SIZE.height - PADDING - (position.lat - CITY_WINDOW.minLat) * KM_PER_DEGREE_LAT * UNITS_PER_KM,
  };
}

/** Inverse of `networkXY`, so a tap on the drawing becomes a position. */
export function networkPosition(point: { x: number; y: number }): Position {
  return {
    lng: CITY_WINDOW.minLng + (point.x - PADDING) / (KM_PER_DEGREE_LNG * COS_LAT * UNITS_PER_KM),
    lat: CITY_WINDOW.minLat + (NETWORK_SIZE.height - PADDING - point.y) / (KM_PER_DEGREE_LAT * UNITS_PER_KM),
  };
}

/** Round to a tenth of a drawing unit: enough for a screen, and the path strings stay short. */
const n = (value: number) => (Math.round(value * 10) / 10).toString();

/** A polyline as an SVG path. Each run of points is its own "M ... L ..." subpath. */
export function pathOf(lines: Position[][]): string {
  const parts: string[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    const first = networkXY(line[0]);
    let d = `M${n(first.x)} ${n(first.y)}`;
    for (let i = 1; i < line.length; i += 1) {
      const p = networkXY(line[i]);
      d += `L${n(p.x)} ${n(p.y)}`;
    }
    parts.push(d);
  }
  return parts.join("");
}

function distKm(a: Position, b: Position): number {
  const r = 6371;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dp = ((b.lat - a.lat) * Math.PI) / 180;
  const dl = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(s)));
}

function crossTrackKm(a: Position, b: Position, p: Position): number {
  const cosLat = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  const bx = (b.lng - a.lng) * (Math.PI / 180) * 6371.0088 * cosLat;
  const by = (b.lat - a.lat) * (Math.PI / 180) * 6371.0088;
  const px = (p.lng - a.lng) * (Math.PI / 180) * 6371.0088 * cosLat;
  const py = (p.lat - a.lat) * (Math.PI / 180) * 6371.0088;
  const lsq = bx * bx + by * by;
  if (lsq === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / lsq));
  return Math.hypot(px - t * bx, py - t * by);
}

/**
 * Drop multi-corridor homonym stops that belong to a different town from a route's
 * stop chain so the route line does not spike across the map.
 */
export function filterRouteCorridorStops(
  names: string[],
  positionOf: (name: string) => Position | null = stopPosition,
): Array<{ name: string; pos: Position }> {
  let loc: Array<{ name: string; pos: Position }> = [];
  for (const name of names) {
    const pos = positionOf(name);
    if (pos) loc.push({ name, pos });
  }
  if (loc.length <= 2) return loc;
  if (loc.length >= 4) {
    const b = distKm(loc[loc.length - 2].pos, loc[loc.length - 1].pos);
    const prevLeg = distKm(loc[loc.length - 3].pos, loc[loc.length - 2].pos);
    const skipPrev = distKm(loc[loc.length - 3].pos, loc[loc.length - 1].pos);
    const a = distKm(loc[0].pos, loc[loc.length - 2].pos);
    const c = distKm(loc[0].pos, loc[loc.length - 1].pos);
    if (b > 18 && skipPrev > 18 && prevLeg < b * 0.7 && a > 10 && c * c < a * a + b * b) {
      loc = loc.slice(0, -1);
    }
  }
  if (loc.length >= 4) {
    const b = distKm(loc[0].pos, loc[1].pos);
    const nextLeg = distKm(loc[1].pos, loc[2].pos);
    const skipNext = distKm(loc[0].pos, loc[2].pos);
    const a = distKm(loc[1].pos, loc[loc.length - 1].pos);
    const c = distKm(loc[0].pos, loc[loc.length - 1].pos);
    if (b > 18 && skipNext > 18 && nextLeg < b * 0.7 && a > 10 && c * c < a * a + b * b) {
      loc = loc.slice(1);
    }
  }
  while (loc.length > 2) {
    let bestSave = 0;
    let bestSlice: [number, number] | null = null;
    for (const w of [1, 2]) {
      if (loc.length - w < 2) continue;
      for (let k = 1; k < loc.length - w; k += 1) {
        const a = loc[k - 1].pos;
        const b = loc[k + w].pos;
        const ab = distKm(a, b);
        const sub = [a, ...Array.from({ length: w }, (_, j) => loc[k + j].pos), b];
        let pathD = 0;
        for (let i = 0; i < sub.length - 1; i += 1) pathD += distKm(sub[i], sub[i + 1]);
        const detour = pathD - ab;
        let maxXt = 0;
        for (let j = 0; j < w; j += 1) maxXt = Math.max(maxXt, crossTrackKm(a, b, loc[k + j].pos));
        const jumpIn = distKm(a, loc[k].pos);
        const jumpOut = distKm(loc[k + w - 1].pos, b);
        if (
          detour > Math.max(9, 0.75 * ab) &&
          maxXt > Math.max(5, 0.35 * ab) &&
          Math.min(jumpIn, jumpOut) > Math.max(6, 0.45 * ab)
        ) {
          const score = (jumpIn + jumpOut - ab) / w ** 0.35;
          if (score > bestSave) {
            bestSave = score;
            bestSlice = [k, k + w];
          }
        }
      }
    }
    if (!bestSlice) break;
    loc = [...loc.slice(0, bestSlice[0]), ...loc.slice(bestSlice[1])];
  }
  return loc;
}

/**
 * One route drawn as a line: the road between each pair of consecutive located stops where
 * a road shape is bundled, a straight line where it is not. A stop with no position is
 * skipped and its neighbours are joined, which is what the ride engine measures too.
 */
export function routeLine(
  names: string[],
  roadFor: (from: string, to: string) => Position[] | null = legGeometry,
  positionOf: (name: string) => Position | null = stopPosition,
): { line: Position[]; roadLegs: number; straightLegs: number } {
  const valid = filterRouteCorridorStops(names, positionOf);
  const line: Position[] = [];
  let roadLegs = 0;
  let straightLegs = 0;
  let previous: string | null = null;
  for (const { name, pos: here } of valid) {
    if (previous === null) {
      line.push(here);
    } else if (name !== previous) {
      const road = roadFor(previous, name);
      if (road && road.length >= 2) {
        const last = line[line.length - 1];
        line.push(...(last && last.lat === road[0].lat && last.lng === road[0].lng ? road.slice(1) : road));
        roadLegs += 1;
      } else {
        line.push(here);
        straightLegs += 1;
      }
    }
    previous = name;
  }
  return { line, roadLegs, straightLegs };
}
