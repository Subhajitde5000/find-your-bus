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
import { buildRide, matchRide, nearestSegment, pointAtMetres, type RideRoute } from "@/lib/ride";
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
  it("starts where the routed road starts, at the first stop", () => {
    const ride = rideOrFail("1");
    const first = ride.stops.find((stop) => stop.position)!;
    const point = pointAtMetres(ride, 0)!;
    assert.ok(point, "a rideable route must have a point at zero");
    assert.deepEqual(point, ride.segments[0].points[0], "zero is the first vertex of the road");
    // The shelter is a few metres off the carriageway, so the drawn line starts near it
    // rather than exactly on it.
    assert.ok(
      haversineMetres(point, first.position!) < 150,
      `${first.name} is ${haversineMetres(point, first.position!).toFixed(0)} m from the road`,
    );
  });

  it("ends the corridor at the last stop, and clamps past it", () => {
    const ride = rideOrFail("1");
    const last = [...ride.stops].reverse().find((stop) => stop.position)!;
    const lastSegment = ride.segments[ride.segments.length - 1];
    const point = pointAtMetres(ride, ride.totalMetres)!;
    assert.deepEqual(point, lastSegment.points[lastSegment.points.length - 1]);
    assert.ok(haversineMetres(point, last.position!) < 150);

    // This project never invents a position: a bus past the end of the mapped corridor
    // is drawn at the end of it, not projected into open country.
    const beyond = pointAtMetres(ride, ride.totalMetres + 25_000)!;
    assert.deepEqual(beyond, point);
    const before = pointAtMetres(ride, -500)!;
    assert.deepEqual(before, ride.segments[0].points[0]);
  });

  it("places every distance on the road, and in order", () => {
    const ride = rideOrFail("1");
    let previous = -Infinity;
    const steps = 50;
    for (let index = 0; index <= steps; index += 1) {
      const metres = (ride.totalMetres * index) / steps;
      const point = pointAtMetres(ride, metres)!;
      const found = nearestSegment(ride, point);
      assert.ok(found, `no corridor at ${metres.toFixed(0)} m`);
      const at = found.segment.startMetres + found.alongMetres;
      // Going out along the corridor and measuring the result back must give the same
      // distance: the marker is placed by distance, so the two must agree.
      assert.ok(Math.abs(at - metres) < 1, `${metres.toFixed(0)} m came back as ${at.toFixed(0)} m`);
      assert.ok(found.offsetMetres < 0.01, `the point is ${found.offsetMetres.toFixed(2)} m off its own road`);
      assert.ok(at > previous || index === 0);
      previous = at;
    }
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

  it("says when a leg has no road shape and is drawn straight", () => {
    // Digha Express runs past stops the road export does not reach, so some legs have no
    // shape to draw. The caption must admit that rather than let a straight line pass
    // for a road.
    const ride = rideOrFail("Digha_Express");
    const straight = ride.segments.length - ride.roadSegments;
    assert.ok(straight > 0, "this route needs a leg with no road shape");
    const markup = renderMap(ride, null, false);
    assert.ok(
      markup.includes(`${straight} of ${ride.segments.length} legs`),
      `no straight-leg note in ${markup.slice(-600)}`,
    );
    assert.ok(markup.includes("straight line"));
  });

  it("draws a scale bar in real units", () => {
    const ride = rideOrFail("1");
    const markup = renderMap(ride, null, false);
    assert.ok(/class="ride-map-scale"/.test(markup));
    assert.ok(/(km|\d+ m)</.test(markup), "the scale bar should carry a distance label");
  });

  it("draws every road at the same scale", () => {
    /*
     * The one property a map has to have: the same scale everywhere. Each drawn edge is
     * compared with its real length, so a projection that squashed one axis, or a line
     * built from mismatched coordinates, would show up as edges that disagree.
     *
     * Coordinates are drawn to a tenth of an SVG unit, so an edge is allowed that much
     * rounding at each end plus half a percent of its length.
     */
    const ride = rideOrFail("1");
    const markup = renderMap(ride, null, false);
    const line = /class="ride-map-line" d="([^"]+)"/.exec(markup);
    assert.ok(line, "the route line should be drawn");
    const drawn = [...line[1].matchAll(/[ML]([-\d.]+) ([-\d.]+)/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));

    const road: { lat: number; lng: number }[] = [];
    for (const segment of ride.segments) {
      for (const point of segment.points) {
        const last = road[road.length - 1];
        if (!last || last.lat !== point.lat || last.lng !== point.lng) road.push(point);
      }
    }
    assert.equal(drawn.length, road.length, "every vertex of the road should be drawn");

    const scales: number[] = [];
    for (let index = 1; index < road.length; index += 1) {
      const metres = haversineMetres(road[index - 1], road[index]);
      if (metres < 5) continue;
      scales.push(
        Math.hypot(drawn[index].x - drawn[index - 1].x, drawn[index].y - drawn[index - 1].y) / metres,
      );
    }
    assert.ok(scales.length > 100, `${scales.length} measurable edges`);
    const sorted = [...scales].sort((a, b) => a - b);
    const scale = sorted[Math.floor(sorted.length / 2)];

    for (let index = 1; index < road.length; index += 1) {
      const metres = haversineMetres(road[index - 1], road[index]);
      const length = Math.hypot(drawn[index].x - drawn[index - 1].x, drawn[index].y - drawn[index - 1].y);
      if (metres < 10) continue;
      const slack = 0.15 + length * 0.005;
      assert.ok(
        Math.abs(length - metres * scale) <= slack,
        `edge ${index} is ${length.toFixed(2)} units for ${metres.toFixed(1)} m, expected ${(metres * scale).toFixed(2)}`,
      );
    }
  });

  it("keeps every stop and the marker inside the drawing", () => {
    const ride = rideOrFail("1");
    const markup = renderMap(ride, ride.totalMetres * 0.5, true);
    // the map's own <svg>: the search box and the controls carry icons with a viewBox of their own
    const viewBox = /<svg viewBox="0 0 ([\d.]+) ([\d.]+)" class="ride-map-svg/.exec(markup);
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
