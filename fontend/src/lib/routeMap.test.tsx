/*
 * Tests for the drawn route map.
 *
 * Two things are under test, and they fail in different ways.
 *
 * `pointAtMetres` is geometry: it is what puts the passenger's marker on the line. If
 * it is wrong the marker drifts off the route, which looks like a bug in the map rather
 * than a bug in the maths, so it is checked against the endpoints and for monotonicity.
 *
 * `RideRouteMap` is presentation: it is checked for the things that can only be seen
 * once the component renders — that unlocated stops are skipped rather than plotted at
 * zero, that the marker appears only once the passenger is on the bus, and that the
 * drawing says so when part of the route could not be mapped.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RideRouteMap } from "@/components/RideRouteMap";
import { buildRide, matchRide, pointAtMetres, type RideRoute } from "@/lib/ride";
import { haversineMetres } from "@/lib/geo";

function rideOrFail(number: string, direction: "outbound" | "return" = "outbound"): RideRoute {
  const result = buildRide({ number, direction });
  if (!result.ok) assert.fail(`route ${number} should build: ${result.failure.message}`);
  return result.ride;
}

function countOf(markup: string, needle: string): number {
  return markup.split(needle).length - 1;
}

/** The bus marker's SVG translation, which is where the projection put the passenger. */
function markerAt(markup: string): { x: number; y: number } {
  const found = /class="ride-map-marker" transform="translate\(([-\d.]+) ([-\d.]+)\)"/.exec(markup);
  assert.ok(found, `no bus marker in markup: ${markup.slice(0, 400)}`);
  return { x: Number(found[1]), y: Number(found[2]) };
}

function renderMap(ride: RideRoute, metresAlong: number | null, onBus: boolean): string {
  const point = metresAlong === null ? null : pointAtMetres(ride, metresAlong);
  const match = point ? matchRide(ride, point) : null;
  return renderToStaticMarkup(
    <RideRouteMap
      ride={ride}
      metresAlong={metresAlong}
      onBus={onBus}
      currentStop={onBus && match ? match.stopIndex : null}
      destinationIndex={ride.stops.length - 1}
      nextStopIndex={onBus ? (match?.nextStopIndex ?? null) : null}
      passed={new Set()}
    />,
  );
}

describe("pointAtMetres", () => {
  it("puts zero metres at the first located stop", () => {
    const ride = rideOrFail("1");
    const first = ride.stops.find((stop) => stop.position)!;
    const point = pointAtMetres(ride, 0)!;
    assert.ok(point, "a rideable route must have a point at zero");
    assert.ok(
      haversineMetres(point, first.position!) < 1,
      `expected ${JSON.stringify(point)} to be at ${first.name}`,
    );
  });

  it("puts the full corridor at the last located stop, and clamps past it", () => {
    const ride = rideOrFail("1");
    const last = [...ride.stops].reverse().find((stop) => stop.position)!;
    const point = pointAtMetres(ride, ride.totalMetres)!;
    assert.ok(haversineMetres(point, last.position!) < 1);

    // This project never invents a position: a bus past the end of the mapped corridor
    // is drawn at the end of it, not projected into open country.
    const beyond = pointAtMetres(ride, ride.totalMetres + 25_000)!;
    assert.ok(haversineMetres(beyond, last.position!) < 1);
    const before = pointAtMetres(ride, -500)!;
    const first = ride.stops.find((stop) => stop.position)!;
    assert.ok(haversineMetres(before, first.position!) < 1);
  });

  it("advances monotonically along the corridor", () => {
    const ride = rideOrFail("1");
    let previous = pointAtMetres(ride, 0)!;
    let travelled = 0;
    const steps = 20;
    for (let index = 1; index <= steps; index += 1) {
      const point = pointAtMetres(ride, (ride.totalMetres * index) / steps)!;
      travelled += haversineMetres(previous, point);
      previous = point;
    }
    // Walking the corridor stop by stop must cover at least the corridor's length; the
    // slack is the difference between straight segments and great-circle legs.
    assert.ok(
      travelled >= ride.totalMetres * 0.99,
      `walked ${travelled.toFixed(0)} m of a ${ride.totalMetres.toFixed(0)} m corridor`,
    );
  });

  it("returns null when the corridor cannot be drawn at all", () => {
    const ride = rideOrFail("1");
    const empty: RideRoute = { ...ride, segments: [], totalMetres: 0 };
    assert.equal(pointAtMetres(empty, 100), null);
  });
});

describe("RideRouteMap", () => {
  it("draws one dot per located stop, and no dot for the rest", () => {
    const ride = rideOrFail("1");
    const markup = renderMap(ride, null, false);
    assert.ok(ride.locatedStops < ride.stops.length, "route 1 has an unlocated stop, which this test needs");
    // The unlocated stop is skipped by the line rather than plotted at 0,0.
    assert.equal(countOf(markup, 'class="ride-map-stop'), ride.locatedStops);
    assert.equal(countOf(markup, 'class="ride-map-stop current'), 0);
  });

  it("shows no bus marker until the passenger is on the bus", () => {
    const ride = rideOrFail("1");
    assert.equal(countOf(renderMap(ride, null, false), 'class="ride-map-marker"'), 0);
    assert.equal(countOf(renderMap(ride, 1000, false), 'class="ride-map-marker"'), 0);
    assert.equal(countOf(renderMap(ride, 1000, true), 'class="ride-map-marker"'), 1);
  });

  it("moves the marker along the route as the bus travels", () => {
    const ride = rideOrFail("1");
    const quarter = ride.totalMetres * 0.25;
    const threeQuarters = ride.totalMetres * 0.75;
    const early = markerAt(renderMap(ride, quarter, true));
    const late = markerAt(renderMap(ride, threeQuarters, true));
    assert.notDeepEqual(early, late, "the marker must not be pinned to one place");
  });

  it("draws the travelled part of the route only once on board", () => {
    const ride = rideOrFail("1");
    assert.equal(countOf(renderMap(ride, null, false), "ride-map-done"), 0);
    assert.equal(renderMap(ride, ride.totalMetres * 0.5, true).includes("ride-map-done"), true);
  });

  it("says how many stops could not be mapped", () => {
    const ride = rideOrFail("1");
    const missing = ride.stops.length - ride.locatedStops;
    const markup = renderMap(ride, null, false);
    assert.ok(markup.includes(`${missing} stop`), `no gap note in ${markup.slice(0, 600)}`);
    assert.ok(markup.includes("no published position"));
  });

  it("draws a scale bar in real units", () => {
    const ride = rideOrFail("1");
    const markup = renderMap(ride, null, false);
    assert.ok(/class="ride-map-scale"/.test(markup));
    assert.ok(/(km|\d+ m)</.test(markup), "the scale bar should carry a distance label");
  });

  it("draws the route without distortion", () => {
    /*
     * The one property a map has to have: the same scale everywhere. If the projection
     * is right, one SVG unit is the same number of metres on every leg of the route, so
     * the drawing is a true shape and not a squashed one.
     */
    const ride = rideOrFail("1");
    const markup = renderMap(ride, null, false);
    const circles = new Map<number, { x: number; y: number }>();
    for (const match of markup.matchAll(
      /<circle class="ride-map-stop [a-z]+" cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"><title>(.*?)(?: \(passed\))?<\/title>/g,
    )) {
      const index = ride.stops.findIndex((stop) => stop.name === match[4]);
      if (index >= 0) circles.set(index, { x: Number(match[1]), y: Number(match[2]) });
    }
    assert.equal(circles.size, ride.locatedStops);

    const scales: number[] = [];
    for (const segment of ride.segments) {
      const from = circles.get(segment.fromStop);
      const to = circles.get(segment.toStop);
      assert.ok(from && to, `segment ${segment.fromStop}->${segment.toStop} should be drawn`);
      const units = Math.hypot(to.x - from.x, to.y - from.y);
      scales.push(units / segment.metres);
    }
    const min = Math.min(...scales);
    const max = Math.max(...scales);
    assert.ok(
      max / min < 1.01,
      `scale varies by ${(((max / min) - 1) * 100).toFixed(2)}% across the route: ${scales.map((s) => s.toFixed(5)).join(", ")}`,
    );
  });

  it("keeps every stop and the marker inside the drawing", () => {
    const ride = rideOrFail("1");
    const markup = renderMap(ride, ride.totalMetres * 0.5, true);
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(markup);
    assert.ok(viewBox);
    const width = Number(viewBox[1]);
    const height = Number(viewBox[2]);
    const points = [
      ...[...markup.matchAll(/<circle class="ride-map-stop [a-z]+" cx="([-\d.]+)" cy="([-\d.]+)"/g)].map((m) => ({
        x: Number(m[1]),
        y: Number(m[2]),
      })),
      markerAt(markup),
    ];
    for (const point of points) {
      assert.ok(point.x >= 0 && point.x <= width, `x ${point.x} outside 0..${width}`);
      assert.ok(point.y >= 0 && point.y <= height, `y ${point.y} outside 0..${height}`);
    }
  });

  it("puts the marker on the line, and ends the travelled path there", () => {
    const ride = rideOrFail("1");
    const metres = ride.totalMetres * 0.5;
    const markup = renderMap(ride, metres, true);
    const marker = markerAt(markup);

    const done = /class="ride-map-done" d="([^"]+)"/.exec(markup);
    assert.ok(done, "the travelled part should be drawn");
    const points = [...done[1].matchAll(/([ML])([-\d.]+) ([-\d.]+)/g)].map((m) => ({ x: +m[2], y: +m[3] }));
    const last = points[points.length - 1];
    assert.ok(
      Math.hypot(last.x - marker.x, last.y - marker.y) < 0.2,
      `travelled path ends at ${JSON.stringify(last)}, marker at ${JSON.stringify(marker)}`,
    );

    // The marker must sit on the route polyline, not near it.
    const line = /class="ride-map-line" d="([^"]+)"/.exec(markup)!;
    const vertices = [...line[1].matchAll(/([ML])([-\d.]+) ([-\d.]+)/g)].map((m) => ({ x: +m[2], y: +m[3] }));
    let closest = Infinity;
    for (let index = 1; index < vertices.length; index += 1) {
      closest = Math.min(closest, distanceToSegment(marker, vertices[index - 1], vertices[index]));
    }
    assert.ok(closest < 0.5, `marker is ${closest.toFixed(2)} units off the route line`);
  });

  it("renders nothing when a route has fewer than two located stops", () => {
    const ride = rideOrFail("1");
    const stripped: RideRoute = {
      ...ride,
      stops: ride.stops.map((stop, index) => (index === 0 ? stop : { ...stop, position: null, distanceAlongMetres: null })),
      locatedStops: 1,
    };
    assert.equal(renderMap(stripped, null, false), "");
  });
});

/** Perpendicular distance from a point to a segment, in SVG units. */
function distanceToSegment(
  point: { x: number; y: number },
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSq));
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}
