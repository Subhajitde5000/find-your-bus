/*
 * Zoom, pan and label placement for the route map.
 *
 * Pure functions on numbers, so the interaction maths is unit tested without a DOM. The
 * map is drawn once at a fixed size (`size`, in SVG units); zooming only changes which
 * rectangle of that drawing the SVG viewBox shows. A `View` is that rectangle described
 * as a zoom factor and the point at its centre.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface View {
  /** 1 shows the whole route; 8 shows one eighth of its width. */
  zoom: number;
  /** Centre of the visible rectangle, in drawing units. */
  cx: number;
  cy: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_ZOOM = 1;
/**
 * How far in the reader can go. The drawing is about 500 x 670 units for 45 x 60 km, so
 * 20 shows a 2-3 km square: close enough to tell two neighbouring stops apart on a
 * phone, which is what the stop map is for. Both maps share the limit so the zoom buttons
 * behave the same way.
 */
export const MAX_ZOOM = 80;
/** Zoom the "follow my bus" button switches to when the map is still showing the whole route. */
export const FOLLOW_ZOOM = 4;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function fitView(size: Size): View {
  return { zoom: MIN_ZOOM, cx: size.width / 2, cy: size.height / 2 };
}

/** Clamp the zoom, and keep the visible rectangle inside the drawing. */
export function clampView(view: View, size: Size): View {
  const zoom = clamp(view.zoom, MIN_ZOOM, MAX_ZOOM);
  const halfW = size.width / zoom / 2;
  const halfH = size.height / zoom / 2;
  return {
    zoom,
    cx: clamp(view.cx, halfW, size.width - halfW),
    cy: clamp(view.cy, halfH, size.height - halfH),
  };
}

export function viewRect(view: View, size: Size): Rect {
  const v = clampView(view, size);
  const w = size.width / v.zoom;
  const h = size.height / v.zoom;
  return { x: v.cx - w / 2, y: v.cy - h / 2, w, h };
}

export function viewBoxOf(view: View, size: Size): string {
  const { x, y, w, h } = viewRect(view, size);
  const n = (value: number) => String(Number(value.toFixed(1))); // 0.0 -> "0", 340.0 -> "340"
  return `${n(x)} ${n(y)} ${n(w)} ${n(h)}`;
}

/** Multiply the zoom by `factor` while the drawing point under `anchor` stays where it is. */
export function zoomAt(view: View, size: Size, factor: number, anchor: Point): View {
  const current = clampView(view, size);
  const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const ratio = current.zoom / zoom;
  return clampView(
    { zoom, cx: anchor.x + (current.cx - anchor.x) * ratio, cy: anchor.y + (current.cy - anchor.y) * ratio },
    size,
  );
}

/** Move the picture by (dx, dy) drawing units, as a finger dragging it would. */
export function panBy(view: View, size: Size, dx: number, dy: number): View {
  const current = clampView(view, size);
  return clampView({ ...current, cx: current.cx - dx, cy: current.cy - dy }, size);
}

export function centreOn(view: View, size: Size, point: Point): View {
  return clampView({ ...view, cx: point.x, cy: point.y }, size);
}

export interface LabelCandidate {
  id: string;
  x: number;
  y: number;
  text: string;
  /** Lower is placed first; a label that collides with an earlier one is dropped. */
  priority: number;
}

export interface PlacedLabel extends LabelCandidate {
  anchor: "start" | "end";
  /** Text position, offset from the dot. */
  tx: number;
  ty: number;
}

/**
 * Choose which stop names to print and where. A label goes to the right of its dot, or to
 * the left when it would run off the right edge; it is dropped when it falls outside the
 * visible rectangle or overlaps a label already placed. Sizes are in drawing units and are
 * estimates (a character is about 0.55 of the font size wide), which is accurate enough to
 * keep neighbouring names apart.
 */
export function placeLabels(candidates: LabelCandidate[], rect: Rect, fontSize: number, gap: number): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const boxes: Rect[] = [];
  const height = fontSize * 1.1;
  const ordered = [...candidates].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  for (const candidate of ordered) {
    const { x, y } = candidate;
    if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) continue;
    const width = candidate.text.length * fontSize * 0.55;
    const flip = x + gap + width > rect.x + rect.w;
    const box: Rect = { x: flip ? x - gap - width : x + gap, y: y - height / 2, w: width, h: height };
    if (box.x < rect.x) continue;
    const clash = boxes.some(
      (other) => box.x < other.x + other.w && box.x + box.w > other.x && box.y < other.y + other.h && box.y + box.h > other.y,
    );
    if (clash) continue;
    boxes.push(box);
    placed.push({
      ...candidate,
      anchor: flip ? "end" : "start",
      tx: flip ? x - gap : x + gap,
      ty: y + fontSize * 0.35,
    });
  }
  return placed;
}
