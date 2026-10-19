"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { LocateFixed, Maximize2, Minus, Plus } from "lucide-react";
import { corridorUpTo, pointAtMetres, type RideRoute } from "@/lib/ride";
import { formatDistance, type Position } from "@/lib/geo";
import {
  centreOn,
  clampView,
  FOLLOW_ZOOM,
  panBy,
  placeLabels,
  viewBoxOf,
  viewRect,
  zoomAt,
  type LabelCandidate,
  type Point,
  type Rect,
  type View,
} from "@/lib/mapView";

/*
 * The route drawn as a map, from the data already in the bundle.
 *
 * This is the offline map. A tile map needs image tiles: a provider, an API key, and
 * tens of megabytes pre-downloaded before the passenger leaves home. This one needs
 * nothing, because the stop coordinates and the road shape of every timed leg are
 * already in the bundle -- routed once over OpenStreetMap, simplified, and shipped as
 * a few hundred kilobytes of JSON.
 *
 * What it is: the roads the bus actually drives, correctly proportioned, with a scale
 * bar, a north arrow, and the bus marked where the passenger is. What it is not: a
 * street map. There are no other streets, buildings or landmarks, because drawing
 * them is what costs the tiles.
 *
 * The projection is equirectangular with a cosine correction for longitude. Over the
 * tens of kilometres a bus route covers it is indistinguishable from a conformal
 * projection, and it has the virtue of being obviously correct. Because it is affine,
 * any geographic point (not just a stop) can be placed with the same transform, which
 * is how the bus marker lands exactly on the line.
 */

const KM_PER_DEGREE_LAT = 110.574;
const KM_PER_DEGREE_LNG = 111.32;
/** Padding around the drawing, and the box it is fitted into, in SVG units. */
const PADDING = 26;
const MAX_WIDTH = 340;
const MAX_HEIGHT = 300;

interface Projection {
  /** The affine transform, so any point can be placed with the same maths as the stops. */
  minLat: number;
  minLng: number;
  cosLat: number;
  unitsPerKm: number;
  width: number;
  height: number;
  viewBox: string;
}

interface ProjectedStop {
  index: number;
  name: string;
  x: number;
  y: number;
  /** Metres along the corridor, or null for a stop with no position. */
  at: number | null;
}

function toXY(projection: Projection, point: Position): { x: number; y: number } {
  return {
    x: PADDING + (point.lng - projection.minLng) * KM_PER_DEGREE_LNG * projection.cosLat * projection.unitsPerKm,
    // SVG y grows downwards, and north is up.
    y: projection.height - PADDING - (point.lat - projection.minLat) * KM_PER_DEGREE_LAT * projection.unitsPerKm,
  };
}

/**
 * The corridor as one line.
 *
 * Consecutive legs normally meet exactly, because both were routed to the same point
 * on the road. Where they do not -- a stop mapped on each side of a divided road -- the
 * join is a short straight step, which is truer than pretending the bus teleports.
 */
function corridorOf(ride: RideRoute): Position[] {
  const points: Position[] = [];
  for (const segment of ride.segments) {
    for (const point of segment.points) {
      const last = points[points.length - 1];
      if (!last || last.lat !== point.lat || last.lng !== point.lng) points.push(point);
    }
  }
  return points;
}

function project(ride: RideRoute): { projection: Projection; stops: ProjectedStop[]; corridor: Position[] } | null {
  if (ride.stops.filter((stop) => stop.position).length < 2) return null;
  const corridor = corridorOf(ride);
  if (corridor.length < 2) return null;

  const lats = corridor.map((point) => point.lat);
  const lngs = corridor.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  // A route running due north, or stops sharing a position, would divide by zero.
  const spanX = Math.max((maxLng - minLng) * KM_PER_DEGREE_LNG * cosLat, 0.05);
  const spanY = Math.max((maxLat - minLat) * KM_PER_DEGREE_LAT, 0.05);
  const unitsPerKm = Math.min((MAX_WIDTH - PADDING * 2) / spanX, (MAX_HEIGHT - PADDING * 2) / spanY);
  const width = spanX * unitsPerKm + PADDING * 2;
  const height = spanY * unitsPerKm + PADDING * 2;

  const projection: Projection = {
    minLat,
    minLng,
    cosLat,
    unitsPerKm,
    width,
    height,
    viewBox: `0 0 ${width.toFixed(1)} ${height.toFixed(1)}`,
  };

  const stops: ProjectedStop[] = ride.stops.map((stop) => {
    const base = { index: stop.index, name: stop.name, at: stop.distanceAlongMetres };
    if (!stop.position || stop.distanceAlongMetres === null) return { ...base, x: 0, y: 0 };
    // The stop is drawn where the corridor reaches it, which is the point on the road
    // its coordinate was snapped to. The coordinate itself is the shelter, a few metres
    // to the side, and plotting that would leave every dot beside the line.
    const anchor = pointAtMetres(ride, stop.distanceAlongMetres) ?? stop.position;
    return { ...base, ...toXY(projection, anchor) };
  });

  return { projection, stops, corridor };
}

/**
 * The corridor as one SVG path.
 *
 * A stop with no position is not a vertex: its neighbours' roads meet across the gap,
 * which is what the corridor measures too. Breaking the line instead would leave the
 * passenger's marker floating in a gap it does not actually have.
 */
function toPath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

/** A round distance that fits the scale bar, from the usual 1-2-5 series. */
function scaleBar(unitsPerKm: number, maxUnits: number): { units: number; label: string } {
  const maxKm = maxUnits / unitsPerKm;
  const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200];
  const km = candidates.filter((value) => value <= maxKm).pop() ?? candidates[0];
  return { units: km * unitsPerKm, label: formatDistance(km * 1000) };
}

interface Props {
  ride: RideRoute;
  /** Metres along the corridor, or null before the first match. */
  metresAlong: number | null;
  onBus: boolean;
  /** Index of the stop the passenger is at or has just passed. */
  currentStop: number | null;
  destinationIndex: number;
  /** Index of the next stop ahead. */
  nextStopIndex: number | null;
  passed: Set<number>;
}

/** Where a screen point falls in the drawing, allowing for the letterboxing "meet" adds. */
function clientToDrawing(svg: SVGSVGElement, rect: Rect, clientX: number, clientY: number): Point | null {
  const box = svg.getBoundingClientRect();
  if (box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / rect.w, box.height / rect.h);
  return {
    x: rect.x + (clientX - box.left - (box.width - rect.w * scale) / 2) / scale,
    y: rect.y + (clientY - box.top - (box.height - rect.h * scale) / 2) / scale,
  };
}

const BUTTON_ZOOM = 1.6;
/** Names are printed for every stop from this zoom up, as far as they fit. */
const ALL_LABELS_ZOOM = 2.5;

interface MapState {
  /** Which route and direction this state belongs to, so a new route starts fitted. */
  key: string;
  zoom: number;
  /** Centre of the view; null means the middle of the drawing. */
  centre: Point | null;
  follow: boolean;
}

export function RideRouteMap({
  ride,
  metresAlong,
  onBus,
  currentStop,
  destinationIndex,
  nextStopIndex,
  passed,
}: Props) {
  const built = project(ride);
  const key = `${ride.number}|${ride.direction}`;
  const [stored, setStored] = useState<MapState>({ key, zoom: 1, centre: null, follow: false });
  const state: MapState = stored.key === key ? stored : { key, zoom: 1, centre: null, follow: false };
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ distance: number } | null>(null);

  const size = built ? { width: built.projection.width, height: built.projection.height } : { width: 1, height: 1 };
  const here = built && onBus && metresAlong !== null ? pointAtMetres(ride, metresAlong) : null;
  const marker = built && here ? toXY(built.projection, here) : null;

  const following = state.follow && marker !== null;
  const view: View = clampView(
    {
      zoom: state.zoom,
      cx: following ? marker.x : (state.centre?.x ?? size.width / 2),
      cy: following ? marker.y : (state.centre?.y ?? size.height / 2),
    },
    size,
  );
  const rect = viewRect(view, size);

  // Ctrl/Cmd + wheel zooms. A plain wheel is left alone so the page still scrolls. It needs a
  // native listener: React registers wheel handlers as passive, which cannot preventDefault.
  const viewRef = useRef({ view, rect });
  useEffect(() => {
    viewRef.current = { view, rect };
  });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const { view: current, rect: currentRect } = viewRef.current;
      const anchor = clientToDrawing(svg, currentRect, event.clientX, event.clientY);
      if (!anchor) return;
      const next = zoomAt(current, size, Math.exp(-event.deltaY * 0.01), anchor);
      setStored((previous) => ({ ...(previous.key === key ? previous : { key, zoom: 1, centre: null, follow: false }), zoom: next.zoom, centre: { x: next.cx, y: next.cy } }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [key, size.width, size.height]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!built) return null;
  const { projection, stops, corridor } = built;

  const commit = (next: View, follow = false) =>
    setStored({ key, zoom: next.zoom, centre: { x: next.cx, y: next.cy }, follow });

  const zoomBy = (factor: number) => {
    const anchor = { x: view.cx, y: view.cy };
    commit(zoomAt(view, size, factor, anchor), state.follow);
  };
  const fit = () => setStored({ key, zoom: 1, centre: null, follow: false });
  const toggleFollow = () => {
    if (!marker) return;
    if (state.follow) {
      commit(view, false);
    } else {
      const zoom = Math.max(view.zoom, FOLLOW_ZOOM);
      setStored({ key, zoom, centre: { x: marker.x, y: marker.y }, follow: true });
    }
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (view.zoom <= 1) return; // nothing to drag at full view; leave the touch to page scroll
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    gesture.current = null;
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const previous = pointers.current.get(event.pointerId);
    if (!svg || !previous) return;
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const box = svg.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) return;
    const unit = 1 / Math.min(box.width / rect.w, box.height / rect.h);
    if (pointers.current.size === 1) {
      commit(panBy(view, size, (next.x - previous.x) * unit, (next.y - previous.y) * unit));
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const before = gesture.current?.distance ?? distance;
      gesture.current = { distance };
      const anchor = clientToDrawing(svg, rect, (a.x + b.x) / 2, (a.y + b.y) / 2);
      if (anchor && before > 0) commit(zoomAt(view, size, distance / before, anchor), false);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    gesture.current = null;
  };

  const k = 1 / view.zoom;
  const done = here && metresAlong !== null ? corridorUpTo(ride, metresAlong).map((point) => toXY(projection, point)) : null;
  const scale = scaleBar(projection.unitsPerKm * view.zoom, Math.min(rect.w, rect.h) / 3 * view.zoom);
  const scaleUnits = scale.units / view.zoom;
  const unlocated = stops.filter((stop) => stop.at === null).length;
  const straight = ride.segments.length - ride.roadSegments;

  const located = stops.filter((stop) => stop.at !== null);
  const first = located[0];
  const last = located[located.length - 1];
  const usesRoads = ride.roadSegments > 0;

  const candidates: LabelCandidate[] = located.map((stop) => {
    const priority =
      onBus && stop.index === currentStop ? 0
        : stop.index === nextStopIndex && onBus ? 1
          : stop.index === destinationIndex ? 2
            : stop === first || stop === last ? 3
              : 10 + stop.index;
    return { id: `${stop.index}`, x: stop.x, y: stop.y, text: stop.name, priority };
  });
  const showAll = view.zoom >= ALL_LABELS_ZOOM;
  const labels = placeLabels(
    candidates.filter((candidate) => showAll || candidate.priority < 10),
    rect,
    8.5 * k,
    6 * k,
  );

  const zoomed = view.zoom > 1.001;

  return (
    <figure className="ride-route-map">
      <div className="ride-map-frame">
        <svg
          ref={svgRef}
          viewBox={viewBoxOf(view, size)}
          className={`ride-map-svg${zoomed ? " zoomed" : ""}`}
          style={{ "--k": k, touchAction: zoomed ? "none" : "pan-y" } as React.CSSProperties}
          role="img"
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Map of route ${ride.number}, ${ride.origin} to ${ride.destination}. ${
            usesRoads ? "The route follows the roads it runs on. " : ""
          }${ride.locatedStops} of ${ride.stops.length} stops are mapped.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <marker id="ride-north" viewBox="0 0 10 10" refX="5" refY="9" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M5 0 L9 9 L5 6.5 L1 9 Z" fill="currentColor" />
            </marker>
          </defs>

          <path className="ride-map-line" d={toPath(corridor.map((point) => toXY(projection, point)))} />

          {done && <path className="ride-map-done" d={toPath(done)} />}

          {located.map((stop) => (
            <circle
              key={`stop-${stop.index}`}
              className={stopClass(stop.index, passed, currentStop, nextStopIndex, destinationIndex, onBus)}
              cx={stop.x}
              cy={stop.y}
              r={stopRadius(stop.index, currentStop, destinationIndex, onBus) * k}
            >
              <title>{`${stop.name}${passed.has(stop.index) ? " (passed)" : ""}`}</title>
            </circle>
          ))}

          {marker && (
            <g className="ride-map-marker" transform={`translate(${marker.x.toFixed(1)} ${marker.y.toFixed(1)})`}>
              <circle className="ride-map-marker-halo" r={9 * k} />
              <circle className="ride-map-marker-dot" r={4.5 * k} />
            </g>
          )}

          {/* Stop names, placed so none overlap. The ends of the line, the stop the passenger
              is at, the next stop and their own stop are always tried first; every other name
              appears once the map is zoomed in far enough to fit it. When the terminus itself
              has no published position, the line starts at the first stop that does, and this
              labels that stop rather than putting the terminus's name on a road it was never
              placed on. */}
          {labels.map((label) => (
            <text
              key={`label-${label.id}`}
              className="ride-map-label"
              x={label.tx}
              y={label.ty}
              textAnchor={label.anchor}
            >
              {label.text}
            </text>
          ))}

          <g className="ride-map-north" transform={`translate(${rect.x + rect.w - 16 * k} ${rect.y + 14 * k}) scale(${k})`}>
            <line x1="0" y1="10" x2="0" y2="-6" markerEnd="url(#ride-north)" />
            <text x="0" y="-9" textAnchor="middle">N</text>
          </g>

          <g className="ride-map-scale" transform={`translate(${rect.x + PADDING * k} ${rect.y + rect.h - 7 * k})`}>
            <line x1="0" y1="0" x2={scaleUnits} y2="0" />
            <line x1="0" y1={-3 * k} x2="0" y2={3 * k} />
            <line x1={scaleUnits} y1={-3 * k} x2={scaleUnits} y2={3 * k} />
            <text x={scaleUnits / 2} y={-5 * k} textAnchor="middle">{scale.label}</text>
          </g>
        </svg>

        <div className="ride-map-controls" role="group" aria-label="Map controls">
          <button type="button" onClick={() => zoomBy(BUTTON_ZOOM)} aria-label="Zoom in" disabled={view.zoom >= 12}>
            <Plus size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => zoomBy(1 / BUTTON_ZOOM)} aria-label="Zoom out" disabled={!zoomed}>
            <Minus size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={fit} aria-label="Show the whole route" disabled={!zoomed && !state.follow}>
            <Maximize2 size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={toggleFollow}
            aria-label="Follow my bus"
            aria-pressed={following}
            className={following ? "active" : ""}
            disabled={!marker}
            title={marker ? "Keep the map centred on your bus" : "Available once you are on the bus"}
          >
            <LocateFixed size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <figcaption>
        <span className="ride-map-legend">
          <span className="legend-item"><span className="legend-dot current" /> you</span>
          <span className="legend-item"><span className="legend-dot next" /> next</span>
          <span className="legend-item"><span className="legend-dot destination" /> your stop</span>
        </span>
        <span className="ride-map-note ride-map-hint">Pinch or use + / − to zoom, drag to move.</span>
        {unlocated > 0 && (
          <span className="ride-map-note">
            {unlocated} stop{unlocated === 1 ? "" : "s"} on this route {unlocated === 1 ? "has" : "have"} no published
            position, so {unlocated === 1 ? "it is" : "they are"} not marked here.
          </span>
        )}
        {straight > 0 && (
          <span className="ride-map-note">
            {straight} of {ride.segments.length} leg{ride.segments.length === 1 ? "" : "s"} between stops{" "}
            {straight === 1 ? "has" : "have"} no road shape bundled, so {straight === 1 ? "it is" : "they are"} drawn as
            a straight line.
          </span>
        )}
        <span className="ride-map-note">
          Roads: ©{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap contributors
          </a>
          , ODbL
        </span>
      </figcaption>
    </figure>
  );
}

function stopClass(
  index: number,
  passed: Set<number>,
  currentStop: number | null,
  nextStopIndex: number | null,
  destinationIndex: number,
  onBus: boolean,
): string {
  if (onBus && index === currentStop) return "ride-map-stop current";
  if (index === destinationIndex) return "ride-map-stop destination";
  if (index === nextStopIndex) return "ride-map-stop next";
  if (passed.has(index)) return "ride-map-stop passed";
  return "ride-map-stop ahead";
}

function stopRadius(index: number, currentStop: number | null, destinationIndex: number, onBus: boolean): number {
  if (onBus && index === currentStop) return 6.5;
  if (index === destinationIndex) return 5;
  return 3.2;
}
