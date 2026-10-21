import landmarkData from "@/data/landmarks.json";
import { SERVICE_AREA, isValidPosition, type Position } from "./geo";

/*
 * Landmarks for the map: rivers, canals, bridges, buildings and well-known places.
 *
 * `scripts/build_landmarks.py` writes `src/data/landmarks.json`. A point is a place; a
 * shape is a line (river, canal, bridge) or a closed outline (a building or a lake).
 * Every feature says where it came from, and the map says so too:
 *
 *   source "stop"  placed at the published position of a bus stop whose name says what it
 *                  is. It marks a place NEAR the landmark, never its outline.
 *   source "osm"   a real outline or point from OpenStreetMap.
 *
 * Features are checked as they are read; a bad coordinate drops the feature, not the map.
 */

export type LandmarkKind =
  | "river"
  | "canal"
  | "water"
  | "bridge"
  | "station"
  | "airport"
  | "hospital"
  | "education"
  | "stadium"
  | "museum"
  | "worship"
  | "mall"
  | "landmark";

export type LandmarkSource = "stop" | "osm";

export interface LandmarkPoint extends Position {
  id: string;
  name: string;
  kind: LandmarkKind;
  source: LandmarkSource;
}

export interface LandmarkShape {
  id: string;
  name: string;
  kind: LandmarkKind;
  /** A closed outline (building, lake) rather than a line. */
  closed: boolean;
  points: Position[];
  source: LandmarkSource;
}

export const KIND_LABEL: Record<LandmarkKind, string> = {
  river: "River",
  canal: "Canal",
  water: "Water",
  bridge: "Bridge",
  station: "Railway station",
  airport: "Airport",
  hospital: "Hospital",
  education: "College or university",
  stadium: "Stadium or ground",
  museum: "Museum or zoo",
  worship: "Place of worship",
  mall: "Mall",
  landmark: "Landmark",
};

const KINDS = new Set<string>(Object.keys(KIND_LABEL));

function inServiceArea(position: Position): boolean {
  return (
    position.lat >= SERVICE_AREA.minLat &&
    position.lat <= SERVICE_AREA.maxLat &&
    position.lng >= SERVICE_AREA.minLng &&
    position.lng <= SERVICE_AREA.maxLng
  );
}

interface RawPoint {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  lat?: unknown;
  lng?: unknown;
  source?: unknown;
}
interface RawShape {
  id?: unknown;
  name?: unknown;
  kind?: unknown;
  closed?: unknown;
  points?: unknown;
  source?: unknown;
}

export function readLandmarks(raw: { points?: unknown; shapes?: unknown } | null | undefined): {
  points: LandmarkPoint[];
  shapes: LandmarkShape[];
} {
  const points: LandmarkPoint[] = [];
  const shapes: LandmarkShape[] = [];
  const seen = new Set<string>();

  for (const item of Array.isArray(raw?.points) ? (raw?.points as RawPoint[]) : []) {
    const position = { lat: item?.lat as number, lng: item?.lng as number };
    if (typeof item?.id !== "string" || typeof item?.name !== "string" || !item.name) continue;
    if (typeof item.kind !== "string" || !KINDS.has(item.kind)) continue;
    if (!isValidPosition(position) || !inServiceArea(position) || seen.has(item.id)) continue;
    seen.add(item.id);
    points.push({
      id: item.id,
      name: item.name,
      kind: item.kind as LandmarkKind,
      source: item.source === "osm" ? "osm" : "stop",
      ...position,
    });
  }

  for (const item of Array.isArray(raw?.shapes) ? (raw?.shapes as RawShape[]) : []) {
    if (typeof item?.id !== "string" || typeof item?.name !== "string" || !item.name) continue;
    if (typeof item.kind !== "string" || !KINDS.has(item.kind) || !Array.isArray(item.points)) continue;
    if (seen.has(item.id)) continue;
    const line: Position[] = [];
    let ok = item.points.length >= 2;
    for (const pair of item.points as unknown[]) {
      if (!Array.isArray(pair)) {
        ok = false;
        break;
      }
      const position = { lat: pair[0] as number, lng: pair[1] as number };
      if (!isValidPosition(position) || !inServiceArea(position)) {
        ok = false;
        break;
      }
      line.push(position);
    }
    if (!ok) continue;
    seen.add(item.id);
    shapes.push({
      id: item.id,
      name: item.name,
      kind: item.kind as LandmarkKind,
      closed: item.closed === true && line.length >= 4,
      points: line,
      source: item.source === "stop" ? "stop" : "osm",
    });
  }
  return { points, shapes };
}

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function boundsOf(points: Position[], marginDegrees = 0): Bounds | null {
  if (!points.length) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return {
    minLat: minLat - marginDegrees,
    maxLat: maxLat + marginDegrees,
    minLng: minLng - marginDegrees,
    maxLng: maxLng + marginDegrees,
  };
}

function inside(bounds: Bounds, p: Position): boolean {
  return p.lat >= bounds.minLat && p.lat <= bounds.maxLat && p.lng >= bounds.minLng && p.lng <= bounds.maxLng;
}

/** Points inside a box. */
export function pointsIn(points: LandmarkPoint[], bounds: Bounds): LandmarkPoint[] {
  return points.filter((point) => inside(bounds, point));
}

/** Shapes with any vertex inside a box, or whose own box crosses it (a long river). */
export function shapesIn(shapes: LandmarkShape[], bounds: Bounds): LandmarkShape[] {
  return shapes.filter((shape) => {
    if (shape.points.some((point) => inside(bounds, point))) return true;
    const own = boundsOf(shape.points);
    return own !== null && own.minLat <= bounds.maxLat && own.maxLat >= bounds.minLat && own.minLng <= bounds.maxLng && own.maxLng >= bounds.minLng;
  });
}

const BUNDLED = readLandmarks(landmarkData as { points?: unknown; shapes?: unknown });
export const LANDMARK_POINTS: LandmarkPoint[] = BUNDLED.points;
export const LANDMARK_SHAPES: LandmarkShape[] = BUNDLED.shapes;
