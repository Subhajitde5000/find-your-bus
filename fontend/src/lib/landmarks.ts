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
  | "metro"
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
  metro: "Metro station",
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

/** A point on a shape worth writing its name at: the middle of a river, the centre of a lake. */
export function shapeAnchor(shape: LandmarkShape): Position {
  const points = shape.points;
  if (shape.closed) {
    let lat = 0;
    let lng = 0;
    for (const point of points) {
      lat += point.lat;
      lng += point.lng;
    }
    return { lat: lat / points.length, lng: lng / points.length };
  }
  // Halfway along a line by length, so "Hooghly" sits in the middle of the stretch that is
  // drawn rather than wherever the export happened to put a vertex.
  let total = 0;
  const steps: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].lat - points[i - 1].lat, points[i].lng - points[i - 1].lng);
    steps.push(total);
  }
  const half = total / 2;
  for (let i = 1; i < points.length; i += 1) {
    if (steps[i] >= half) {
      const span = steps[i] - steps[i - 1] || 1;
      const t = (half - steps[i - 1]) / span;
      return {
        lat: points[i - 1].lat + (points[i].lat - points[i - 1].lat) * t,
        lng: points[i - 1].lng + (points[i].lng - points[i - 1].lng) * t,
      };
    }
  }
  return points[points.length - 1];
}

/** The shape length in drawing terms: used to pick the one stretch of a river that is named. */
export function shapeLength(shape: LandmarkShape): number {
  let total = 0;
  for (let i = 1; i < shape.points.length; i += 1) {
    total += Math.hypot(shape.points[i].lat - shape.points[i - 1].lat, shape.points[i].lng - shape.points[i - 1].lng);
  }
  return total;
}

/**
 * One name, one label: of the shapes sharing a name, the longest one writes it. A river
 * traced as twenty segments should say "Hooghly" once, and the stretch that says it is the
 * longest one on screen -- so the name follows the reader instead of sitting on a segment
 * that happens to be longest somewhere off the page.
 */
export function oneLabelPerName<T extends { name: string; weight: number }>(items: T[]): T[] {
  const best = new Map<string, T>();
  for (const item of items) {
    const key = item.name.toLowerCase();
    const current = best.get(key);
    if (!current || item.weight > current.weight) best.set(key, item);
  }
  return [...best.values()];
}

/** Water is labelled at any zoom; a station building only when the reader has zoomed in. */
export function isWater(kind: LandmarkKind): boolean {
  return kind === "river" || kind === "canal" || kind === "water";
}

/** A lake worth naming before the reader zooms in. Smaller tanks are drawn either way and
 * named once the reader has zoomed in, so the default view stays readable. */
const NOTABLE_LAKE_SQ_METRES = 12_000; // 1.2 ha

/** Area of a closed shape in square metres. Shoelace on a local flat projection, which is
 * all a label threshold needs. */
export function shapeAreaSqMetres(shape: LandmarkShape): number {
  const points = shape.points;
  if (points.length < 3) return 0;
  const metresPerLng = 111_320 * Math.cos((points[0].lat * Math.PI) / 180);
  const metresPerLat = 110_574;
  let twice = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.lng * metresPerLng * (b.lat * metresPerLat) - b.lng * metresPerLng * (a.lat * metresPerLat);
  }
  return Math.abs(twice) / 2;
}

/** Rivers and canals always carry their name; a lake only when it is big enough to be one. */
export function isMajorWater(shape: LandmarkShape): boolean {
  if (shape.kind === "river" || shape.kind === "canal") return true;
  return shape.kind === "water" && shape.closed && shapeAreaSqMetres(shape) >= NOTABLE_LAKE_SQ_METRES;
}

const BUNDLED = readLandmarks(landmarkData as { points?: unknown; shapes?: unknown });
export const LANDMARK_POINTS: LandmarkPoint[] = BUNDLED.points;
export const LANDMARK_SHAPES: LandmarkShape[] = BUNDLED.shapes;
