import { placeLabels, type Rect } from "@/lib/mapView";
import { KIND_LABEL, type LandmarkKind } from "@/lib/landmarks";

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
 * Rivers, canals, bridges, buildings and places, drawn under the stops. Water is blue,
 * buildings are filled outlines, and every named place is a small diamond. Presentational:
 * the caller projects the features, so the same layer serves both maps.
 */
export function LandmarkLayer({ points, shapes, k, rect, showLabels, selectedId, onSelect }: Props) {
  const visible = points.filter((p) => p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h);
  const labels = showLabels
    ? placeLabels(
        visible.map((p, i) => ({ id: p.id, x: p.x, y: p.y, text: p.name, priority: p.id === selectedId ? 0 : 1 + i })),
        rect,
        8 * k,
        7 * k,
      )
    : [];
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
      {labels.map((label) => (
        <text key={`lm-${label.id}`} className="landmark-label" x={label.tx} y={label.ty} textAnchor={label.anchor}>
          {label.text}
        </text>
      ))}
    </g>
  );
}
