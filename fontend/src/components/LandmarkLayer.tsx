import { placeLabels, type Rect } from "@/lib/mapView";
import { isWater, KIND_LABEL, oneLabelPerName, type LandmarkKind } from "@/lib/landmarks";

export interface DrawnPoint {
  id: string;
  name: string;
  kind: LandmarkKind;
  x: number;
  y: number;
}
export interface DrawnShape {
  id: string;
  name: string;
  kind: LandmarkKind;
  closed: boolean;
  d: string;
  /** Where the shape's name goes: the middle of a river, the centre of a lake. */
  labelX: number;
  labelY: number;
  /** Drawing length, so the longest stretch of a river gets to write its name. */
  weight: number;
  /** Water that is named before the reader zooms in: a river, a canal, a lake worth naming. */
  major: boolean;
}

interface Props {
  points: DrawnPoint[];
  shapes: DrawnShape[];
  /** Constant-size factor: 1 / zoom. */
  k: number;
  rect: Rect;
  showLabels: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const WATER = new Set<LandmarkKind>(["river", "canal", "water"]);

/**
 * Rivers, canals, lakes, station buildings and places, drawn under the stops. Water is
 * blue -- a filled outline for a lake, a line for a river -- buildings are filled outlines,
 * and every named place is a small diamond. Presentational: the caller projects the
 * features, so the same layer serves both maps.
 *
 * Water keeps its name at every zoom: "Hooghly" is how people find their bearings on this
 * map. Smaller features are only named once the reader has zoomed in, and the caller picks
 * one stretch per name so a segmented river is not labelled twenty times.
 */
export function LandmarkLayer({ points, shapes, k, rect, showLabels, selectedId, onSelect }: Props) {
  const inView = (x: number, y: number) =>
    x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  const visible = points.filter((p) => inView(p.x, p.y));
  // One name, one label, chosen from what is on screen: a river split into twenty segments
  // is named once, at its longest visible stretch, and the name follows the reader.
  const nameable = (shape: DrawnShape) => (shape.major ? true : showLabels);
  const named = new Set(
    oneLabelPerName(shapes.filter((shape) => nameable(shape) && inView(shape.labelX, shape.labelY))).map((shape) => shape.id),
  );
  const labels = shapes
    .filter((shape) => named.has(shape.id))
    .map((shape, i) => ({
      id: shape.id,
      x: shape.labelX,
      y: shape.labelY,
      text: shape.name,
      water: isWater(shape.kind),
      priority: shape.id === selectedId ? 0 : isWater(shape.kind) ? 1 : 20 + i,
    }))
    .concat(
      showLabels
        ? visible.map((p, i) => ({
            id: p.id,
            x: p.x,
            y: p.y,
            text: p.name,
            water: false,
            priority: p.id === selectedId ? 0 : 30 + i,
          }))
        : [],
    );
  // Water names go down first so a stop label is moved out of their way, not over them.
  labels.sort((a, b) => a.priority - b.priority);
  const byId = new Map(labels.map((label) => [label.id, label]));
  const placed = placeLabels(labels, rect, 8 * k, 7 * k);
  const size = 4.2 * k;
  return (
    <g className="landmark-layer">
      {shapes.map((shape) => (
        <path
          key={shape.id}
          className={`landmark-shape ${WATER.has(shape.kind) ? "water" : shape.closed ? "building" : "span"} ${shape.kind}${shape.id === selectedId ? " selected" : ""}`}
          d={shape.d}
          onClick={() => onSelect(shape.id)}
        >
          <title>{`${shape.name} (${KIND_LABEL[shape.kind]})`}</title>
        </path>
      ))}
      {visible.map((p) => (
        <path
          key={p.id}
          className={`landmark-point ${p.kind}${p.id === selectedId ? " selected" : ""}`}
          d={`M${p.x} ${p.y - size}L${p.x + size} ${p.y}L${p.x} ${p.y + size}L${p.x - size} ${p.y}Z`}
          onClick={() => onSelect(p.id)}
        >
          <title>{`${p.name} (${KIND_LABEL[p.kind]})`}</title>
        </path>
      ))}
      {placed.map((label) => (
        <text
          key={`lm-${label.id}`}
          className={`landmark-label${byId.get(label.id)?.water ? " water" : ""}`}
          x={label.tx}
          y={label.ty}
          textAnchor={label.anchor}
        >
          {byId.get(label.id)?.text ?? ""}
        </text>
      ))}
    </g>
  );
}
