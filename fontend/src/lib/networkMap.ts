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
  const line: Position[] = [];
  let roadLegs = 0;
  let straightLegs = 0;
  let previous: string | null = null;
  for (const name of names) {
    const here = positionOf(name);
    if (!here) continue;
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
