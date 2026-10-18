"use client";

import { pointAtMetres, type RideRoute } from "@/lib/ride";
import { formatDistance } from "@/lib/geo";

/*
 * The route drawn as a map, from the bundled coordinates.
 *
 * This is the phase of the offline map that needs no network. A tile map needs image
 * tiles: a provider, an API key, and tens of megabytes pre-downloaded before the
 * passenger leaves home. This one needs nothing, because the stop coordinates are
 * already in the bundle.
 *
 * What it is: the true shape of the route — a polyline through the real stop positions,
 * correctly proportioned, with a scale bar and a north arrow. What it is not: a street
 * map. There are no roads or landmarks, because drawing them is what costs the tiles.
 *
 * The projection is equirectangular with a cosine correction for longitude. Over the
 * tens of kilometres a bus route covers it is indistinguishable from a conformal
 * projection, and it has the virtue of being obviously correct. Because it is affine,
 * any geographic point (not just a stop) can be placed with the same transform, which is
 * how the bus marker lands exactly on the line.
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

function toXY(projection: Projection, lat: number, lng: number): { x: number; y: number } {
  return {
    x: PADDING + (lng - projection.minLng) * KM_PER_DEGREE_LNG * projection.cosLat * projection.unitsPerKm,
    // SVG y grows downwards, and north is up.
    y: projection.height - PADDING - (lat - projection.minLat) * KM_PER_DEGREE_LAT * projection.unitsPerKm,
  };
}

function project(ride: RideRoute): { projection: Projection; stops: ProjectedStop[] } | null {
  const located = ride.stops.filter((stop) => stop.position);
  if (located.length < 2) return null;

  const lats = located.map((stop) => stop.position!.lat);
  const lngs = located.map((stop) => stop.position!.lng);
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
    if (!stop.position) return { ...base, x: 0, y: 0 };
    return { ...base, ...toXY(projection, stop.position.lat, stop.position.lng) };
  });

  return { projection, stops };
}

/**
 * The route as one polyline.
 *
 * A stop with no position is simply not a vertex: the line goes straight from the
 * located stop before it to the located stop after it, which is the same straight-line
 * approximation every other segment of this drawing uses. Breaking the line instead
 * would leave the passenger's marker floating in a gap, because the corridor — the
 * thing the marker is placed along — does bridge it. The caption says which stops are
 * missing.
 */
function toPath(points: { x: number; y: number }[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

/** The part of the route already travelled, ending at the passenger's position. */
function travelledPath(
  stops: ProjectedStop[],
  ride: RideRoute,
  metres: number,
  projection: Projection,
): string | null {
  const points = stops
    .filter((stop) => stop.at !== null && stop.at <= metres)
    .map((stop) => ({ x: stop.x, y: stop.y }));
  const here = pointAtMetres(ride, metres);
  if (here) points.push(toXY(projection, here.lat, here.lng));
  return points.length > 1 ? toPath(points) : null;
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
  if (!built) return null;
  const { projection, stops } = built;

  const here = onBus && metresAlong !== null ? pointAtMetres(ride, metresAlong) : null;
  const marker = here ? toXY(projection, here.lat, here.lng) : null;
  const done = here && metresAlong !== null ? travelledPath(stops, ride, metresAlong, projection) : null;
  const scale = scaleBar(projection.unitsPerKm, Math.min(projection.width, projection.height) / 3);
  const unlocated = stops.filter((stop) => stop.at === null).length;

  const first = stops.find((stop) => stop.at !== null);
  const last = [...stops].reverse().find((stop) => stop.at !== null);

  return (
    <figure className="ride-route-map">
      <svg
        viewBox={projection.viewBox}
        className="ride-map-svg"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        aria-label={`Map of route ${ride.number}, ${ride.origin} to ${ride.destination}. ${ride.locatedStops} of ${ride.stops.length} stops are mapped.`}
      >
        <defs>
          <marker id="ride-north" viewBox="0 0 10 10" refX="5" refY="9" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M5 0 L9 9 L5 6.5 L1 9 Z" fill="currentColor" />
          </marker>
        </defs>

        <path className="ride-map-line" d={toPath(stops.filter((stop) => stop.at !== null))} />

        {done && <path className="ride-map-done" d={done} />}

        {stops
          .filter((stop) => stop.at !== null)
          .map((stop) => (
            <circle
              key={`stop-${stop.index}`}
              className={stopClass(stop.index, passed, currentStop, nextStopIndex, destinationIndex, onBus)}
              cx={stop.x}
              cy={stop.y}
              r={stopRadius(stop.index, currentStop, destinationIndex, onBus)}
            >
              <title>{`${stop.name}${passed.has(stop.index) ? " (passed)" : ""}`}</title>
            </circle>
          ))}

        {marker && (
          <g className="ride-map-marker" transform={`translate(${marker.x.toFixed(1)} ${marker.y.toFixed(1)})`}>
            <circle className="ride-map-marker-halo" r="9" />
            <circle className="ride-map-marker-dot" r="4.5" />
          </g>
        )}

        {/* Terminus labels, so the drawing can be oriented without guessing. */}
        {first && (
          <text
            className="ride-map-label"
            x={first.x}
            y={first.y + 15}
            textAnchor={first.x > projection.width / 2 ? "end" : "start"}
          >
            {ride.origin}
          </text>
        )}
        {last && last.index !== first?.index && (
          <text
            className="ride-map-label"
            x={last.x}
            y={last.y - 11}
            textAnchor={last.x > projection.width / 2 ? "end" : "start"}
          >
            {ride.destination}
          </text>
        )}

        <g className="ride-map-north" transform={`translate(${projection.width - 16} 14)`}>
          <line x1="0" y1="10" x2="0" y2="-6" markerEnd="url(#ride-north)" />
          <text x="0" y="-9" textAnchor="middle">N</text>
        </g>

        <g className="ride-map-scale" transform={`translate(${PADDING} ${projection.height - 7})`}>
          <line x1="0" y1="0" x2={scale.units} y2="0" />
          <line x1="0" y1="-3" x2="0" y2="3" />
          <line x1={scale.units} y1="-3" x2={scale.units} y2="3" />
          <text x={scale.units / 2} y="-5" textAnchor="middle">{scale.label}</text>
        </g>
      </svg>

      <figcaption>
        <span className="ride-map-legend">
          <span className="legend-item"><span className="legend-dot current" /> you</span>
          <span className="legend-item"><span className="legend-dot next" /> next</span>
          <span className="legend-item"><span className="legend-dot destination" /> your stop</span>
        </span>
        {unlocated > 0 && (
          <span className="ride-map-note">
            {unlocated} stop{unlocated === 1 ? "" : "s"} on this route {unlocated === 1 ? "has" : "have"} no published
            position, so {unlocated === 1 ? "it is" : "they are"} not marked here.
          </span>
        )}
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
