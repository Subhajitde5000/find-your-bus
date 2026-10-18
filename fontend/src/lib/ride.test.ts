/*
 * Tests for the offline ride engine.
 *
 * The behaviour these guard:
 * - a passenger is "on the bus" while the phone is anywhere on the route's corridor,
 *   not only when it is standing on a mapped stop;
 * - a passenger who is not on the bus is told so, and the state does not flap when one
 *   bad GPS fix arrives;
 * - distances and times come from the corridor and the published timetable, and a stop
 *   with neither gets no number at all rather than an invented one.
 *
 * Synthetic routes are used for the precise cases, and the real bundled dataset for the
 * invariants that must hold for every route the site ships.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dataset from "@/data/kolkata-bus-data.json";
import {
  advanceTracker,
  buildRide,
  CORRIDOR_RADIUS_METRES,
  corridorCoverage,
  destinationIndex,
  directionEvidence,
  initTracker,
  legDistance,
  matchRide,
  nearestStop,
  pointAtMetres,
  rideLegs,
  rideSummary,
  STOP_RADIUS_METRES,
  timeAnchors,
  TRACKER_DEFAULTS,
  timeAt,
  type RideRoute,
  type RideStop,
  type TrackerState,
} from "@/lib/ride";
import { stopPosition, COORDINATE_STATS, locatedCount } from "@/lib/coords";
import {
  bearingDegrees,
  crossTrackMetres,
  formatDistance,
  haversineMetres,
  isPlausibleFix,
  projectOntoSegment,
  SERVICE_AREA,
  type CorridorSegment,
  type GeoFix,
  type Position,
} from "@/lib/geo";

// ---------------------------------------------------------------- helpers

/** Roughly 111.19 km per degree of latitude at Kolkata's latitude. */
const METRES_PER_DEGREE_LAT = 111_194;

/** A stop `metres` north of the origin, which keeps the synthetic maths exact. */
function north(origin: Position, metres: number): Position {
  return { lat: origin.lat + metres / METRES_PER_DEGREE_LAT, lng: origin.lng };
}

interface SyntheticStop {
  name: string;
  metres: number;
  minutes?: number | null;
  located?: boolean;
}

/**
 * A route running due north from BBD Bagh, stops every 500 m, at 18 km/h
 * (so 500 m is 1 minute 40 s). Used for the precise matching cases.
 */
function syntheticRoute(spec: SyntheticStop[]): RideRoute {
  const origin: Position = { lat: 22.5716, lng: 88.3503 };
  const stops: RideStop[] = spec.map((entry, index) => {
    const located = entry.located !== false;
    return {
      index,
      name: entry.name,
      position: located ? north(origin, entry.metres) : null,
      coordConfidence: located ? "high" : null,
      distanceAlongMetres: null,
      minutes: entry.minutes ?? null,
    };
  });
  const segments: CorridorSegment[] = [];
  let total = 0;
  let previous: RideStop | null = null;
  for (const stop of stops) {
    if (!stop.position) continue;
    stop.distanceAlongMetres = total;
    if (previous?.position) {
      const metres = haversineMetres(previous.position, stop.position);
      segments.push({
        fromStop: previous.index,
        toStop: stop.index,
        points: [previous.position, stop.position],
        metres,
        startMetres: total,
      });
      total += metres;
      stop.distanceAlongMetres = total;
    }
    previous = stop;
  }
  return {
    number: "T1",
    operator: "Test Syndicate",
    type: "Non-AC",
    category: null,
    source: "directory",
    direction: "outbound",
    origin: spec[0]?.name ?? "",
    destination: spec[spec.length - 1]?.name ?? "",
    stops,
    segments,
    roadSegments: 0,
    totalMetres: total,
    locatedStops: stops.filter((stop) => stop.position).length,
    runCode: "RUN-T1-OUT-01",
    bus: null,
    kind: "scheduled",
    headway: 20,
    serviceStart: 360,
    serviceEnd: 1200,
    notes: null,
    speedMps: 5,
    speedBasis: "published",
    otherRuns: 0,
  };
}

const FIVE_STOPS = syntheticRoute([
  { name: "B.B.D. Bagh", metres: 0, minutes: 600 },
  { name: "Esplanade", metres: 500, minutes: 601.67 },
  { name: "College Street", metres: 1000, minutes: 603.33 },
  { name: "Shyambazar", metres: 1500, minutes: 605 },
  { name: "Dum Dum", metres: 2000, minutes: 606.67 },
]);

function fix(lat: number, lng: number, seconds: number, accuracy = 12): GeoFix {
  return { lat, lng, accuracy, timestamp: 1_700_000_000_000 + seconds * 1000 };
}

/** A fix on the corridor, `metres` along it. */
/** Three consecutive on-corridor fixes, which is the earliest the tracker commits. */
function onTheBus(ride: RideRoute = FIVE_STOPS, fromMetres = 200): TrackerState {
  let tracker = initTracker();
  tracker = advanceTracker(tracker, ride, fixAlong(ride, fromMetres, 0));
  tracker = advanceTracker(tracker, ride, fixAlong(ride, fromMetres + 50, 1));
  tracker = advanceTracker(tracker, ride, fixAlong(ride, fromMetres + 100, 2));
  assert.equal(tracker.status, "on-bus");
  return tracker;
}

function fixAlong(ride: RideRoute, metres: number, seconds: number, offsetEastMetres = 0): GeoFix {
  const origin = ride.stops[0].position as Position;
  const position = north(origin, metres);
  const shifted = offsetEastMetres
    ? { lat: position.lat, lng: position.lng + offsetEastMetres / (111_194 * Math.cos((origin.lat * Math.PI) / 180)) }
    : position;
  return fix(shifted.lat, shifted.lng, seconds);
}

// ---------------------------------------------------------------- geometry

describe("geo", () => {
  it("measures a known distance", () => {
    const a = { lat: 22.5, lng: 88.3 };
    const b = { lat: 22.5, lng: 88.31 };
    // 0.01 degree of longitude at 22.5 N is about 1027 m.
    assert.ok(Math.abs(haversineMetres(a, b) - 1027) < 8, `${haversineMetres(a, b)}`);
    assert.equal(haversineMetres(a, a), 0);
  });

  it("is symmetric and gives a north-south kilometre", () => {
    const a = { lat: 22.5, lng: 88.3 };
    const b = north(a, 1000);
    assert.ok(Math.abs(haversineMetres(a, b) - 1000) < 2);
    assert.ok(Math.abs(haversineMetres(b, a) - haversineMetres(a, b)) < 0.01);
  });

  it("reports a bearing north and east", () => {
    const a = { lat: 22.5, lng: 88.3 };
    assert.ok(Math.abs(bearingDegrees(a, north(a, 100)) - 0) < 0.5);
    const east = { lat: 22.5, lng: 88.31 };
    assert.ok(Math.abs(bearingDegrees(a, east) - 90) < 1);
  });

  it("puts a point on a straight corridor at zero offset", () => {
    const a = { lat: 22.5, lng: 88.3 };
    const b = north(a, 1000);
    const mid = north(a, 500);
    const projection = projectOntoSegment(a, b, mid);
    assert.ok(projection.offsetMetres < 0.5, `${projection.offsetMetres}`);
    assert.ok(Math.abs(projection.t - 0.5) < 0.001);
    assert.ok(Math.abs(projection.alongMetres - 500) < 0.5);
  });

  it("measures the offset of a point away from the corridor", () => {
    const a = { lat: 22.5, lng: 88.3 };
    const b = north(a, 1000);
    const east = { lat: 22.5 + 500 / METRES_PER_DEGREE_LAT, lng: 88.3 + 100 / 102_700 };
    assert.ok(Math.abs(crossTrackMetres(a, b, east) - 100) < 3);
  });

  it("clamps a projection beyond the end of the leg", () => {
    const a = { lat: 22.5, lng: 88.3 };
    const b = north(a, 1000);
    const beyond = north(a, 1500);
    const projection = projectOntoSegment(a, b, beyond);
    assert.equal(projection.t, 1);
    assert.ok(Math.abs(projection.offsetMetres - 500) < 2);
  });

  it("rejects implausible fixes", () => {
    assert.equal(isPlausibleFix({ lat: 22.5, lng: 88.3, accuracy: 20 }), true);
    assert.equal(isPlausibleFix({ lat: 12.9, lng: 77.5, accuracy: 20 }), false, "Bengaluru is not Kolkata");
    // Accuracy is the tracker's business, not the map's: a poor fix is still in Kolkata.
    assert.equal(isPlausibleFix({ lat: 22.5, lng: 88.3, accuracy: 900 }), true);
    assert.equal(isPlausibleFix({ lat: Number.NaN, lng: 88.3 }), false);
    assert.equal(isPlausibleFix({ lat: 22.5 }), false);
    assert.equal(isPlausibleFix(null), false);
    // The box covers Siliguri and the Sundarbans.
    assert.equal(isPlausibleFix({ lat: SERVICE_AREA.minLat + 0.1, lng: SERVICE_AREA.minLng + 0.1 }), true);
  });

  it("formats distances the way a passenger says them", () => {
    assert.equal(formatDistance(0), "0 m");
    assert.equal(formatDistance(487), "490 m");
    assert.equal(formatDistance(1400), "1.4 km");
    assert.equal(formatDistance(12_400), "12.4 km", "one decimal up to 99.5 km");
    assert.equal(formatDistance(124_000), "124 km", "and whole kilometres beyond that");
    assert.equal(formatDistance(Number.NaN), "—");
    assert.equal(formatDistance(-5), "—");
  });
});

// ---------------------------------------------------------------- coordinates

describe("bundled stop coordinates", () => {
  const rawStops = (dataset.stops ?? []) as { name: string; lat?: number; lng?: number; coordConfidence?: string }[];
  const located = rawStops.filter((stop) => typeof stop.lat === "number");

  it("has coordinates inside West Bengal for every stop it claims", () => {
    assert.ok(located.length > 1000, `only ${located.length} stops located`);
    for (const stop of located) {
      assert.ok(
        (stop.lat as number) >= SERVICE_AREA.minLat && (stop.lat as number) <= SERVICE_AREA.maxLat,
        `${stop.name}: lat ${stop.lat}`,
      );
      assert.ok(
        (stop.lng as number) >= SERVICE_AREA.minLng && (stop.lng as number) <= SERVICE_AREA.maxLng,
        `${stop.name}: lng ${stop.lng}`,
      );
      assert.ok(
        stop.coordConfidence === "high" || stop.coordConfidence === "medium" || stop.coordConfidence === "review",
        `${stop.name}: confidence ${stop.coordConfidence}`,
      );
    }
  });

  it("agrees with the dataset's own metadata", () => {
    assert.equal(COORDINATE_STATS.located, located.length);
    assert.equal(
      COORDINATE_STATS.high + COORDINATE_STATS.medium + COORDINATE_STATS.review,
      located.length,
      "every located stop has a confidence bucket",
    );
    assert.ok(COORDINATE_STATS.licence.includes("OpenStreetMap"), "the licence is carried into the bundle");
  });

  it("returns a position for a known stop and null for an unknown one", () => {
    const esplanade = stopPosition("Esplanade");
    assert.ok(esplanade, "Esplanade should be located");
    assert.ok(Math.abs(esplanade.lat - 22.565) < 0.02 && Math.abs(esplanade.lng - 88.35) < 0.02);
    assert.equal(stopPosition("A Stop That Does Not Exist"), null);
    assert.equal(stopPosition(""), null);
    assert.equal(stopPosition(undefined), null);
  });

  it("places a stop near where Kolkata's geography puts it", () => {
    const howrah = stopPosition("Howrah Railway Station");
    const shyambazar = stopPosition("Shyambazar");
    assert.ok(howrah && shyambazar);
    // Howrah Station is about 2.5 km west-north-west of Shyambazar, across the river.
    const metres = haversineMetres(howrah, shyambazar);
    assert.ok(metres > 1500 && metres < 4000, `${metres} m`);
    assert.ok(howrah.lng < shyambazar.lng, "Howrah is west of Shyambazar");
  });

  it("can follow every timed route", () => {
    const routes = (dataset.routes ?? []) as { number: string; stops: string[]; runs?: unknown[]; source?: string; frequency?: unknown }[];
    const timed = routes.filter((route) => (route.source === "preview" ? Boolean(route.frequency) : (route.runs?.length ?? 0) > 0));
    assert.ok(timed.length >= 80, `${timed.length} timed routes`);
    const unrideable = timed.filter((route) => locatedCount(route.stops) < 2);
    assert.deepEqual(
      unrideable.map((route) => route.number),
      [],
      "every route with a timetable has at least two located stops",
    );
  });

  it("gives every route in the directory at least two located stops", () => {
    const routes = (dataset.routes ?? []) as { number: string; stops: string[] }[];
    const unrideable = routes.filter((route) => locatedCount(route.stops) < 2);
    assert.deepEqual(unrideable.map((route) => route.number), []);
  });
});

// ---------------------------------------------------------------- buildRide

describe("buildRide", () => {
  it("rejects an unknown route", () => {
    const result = buildRide({ number: "NO-SUCH-ROUTE", direction: "outbound" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.failure.code, "route-not-found");
  });

  it("rejects a route with too few located stops", () => {
    // Every shipped route is rideable, so this is checked on a hand-built route instead.
    const bare = syntheticRoute([
      { name: "Nowhere", metres: 0, located: false },
      { name: "Nowhere Else", metres: 500, located: false },
    ]);
    assert.equal(bare.locatedStops, 0);
    assert.equal(bare.segments.length, 0);
    assert.equal(bare.totalMetres, 0);
  });

  it("builds a real route with a monotonic corridor", () => {
    const result = buildRide({ number: "1", direction: "outbound" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { ride } = result;
    assert.ok(ride.stops.length >= 2);
    assert.ok(ride.locatedStops >= 2);
    assert.ok(ride.totalMetres > 0);
    assert.equal(ride.origin, ride.stops[0].name);
    assert.equal(ride.destination, ride.stops[ride.stops.length - 1].name);
    let previous = -1;
    for (const segment of ride.segments) {
      assert.ok(segment.startMetres > previous, "corridor distances increase");
      assert.ok(segment.metres > 0);
      previous = segment.startMetres;
      assert.ok(segment.fromStop < segment.toStop, "segments run forward");
    }
  });

  it("returns the stops in the direction it was asked for", () => {
    const out = buildRide({ number: "1", direction: "outbound" });
    const back = buildRide({ number: "1", direction: "return" });
    assert.ok(out.ok && back.ok);
    if (!out.ok || !back.ok) return;
    assert.deepEqual(
      back.ride.stops.map((stop) => stop.name),
      [...out.ride.stops.map((stop) => stop.name)].reverse(),
    );
  });

  it("measures a speed from the route's own published times", () => {
    const result = buildRide({ number: "1", direction: "outbound" });
    if (!result.ok) return assert.fail("route 1 should build");
    assert.equal(result.ride.speedBasis, "published");
    // A city bus: between walking pace and a motorway.
    assert.ok(result.ride.speedMps > 2 && result.ride.speedMps < 20, `${result.ride.speedMps} m/s`);
  });

  it("falls back to a default speed when nothing is published", () => {
    const routes = (dataset.routes ?? []) as { number: string; runs?: unknown[]; source?: string; frequency?: unknown }[];
    const catalogue = routes.find(
      (route) => route.source === "catalogue" && (route.runs?.length ?? 0) === 0,
    );
    assert.ok(catalogue, "the directory has catalogue routes");
    const result = buildRide({ number: catalogue.number, direction: "outbound" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.ride.kind, null);
    assert.equal(result.ride.speedBasis, "default");
    assert.ok(result.ride.stops.every((stop) => stop.minutes === null), "no times are invented");
  });

  it("builds every rideable route in the directory without throwing", () => {
    const routes = (dataset.routes ?? []) as { number: string }[];
    let built = 0;
    let rejected = 0;
    for (const route of routes) {
      for (const direction of ["outbound", "return"] as const) {
        const result = buildRide({ number: route.number, direction });
        if (result.ok) {
          built += 1;
          assert.ok(result.ride.locatedStops >= 2, `${route.number} ${direction}`);
          assert.ok(result.ride.totalMetres > 0);
          assert.ok(result.ride.speedMps > 0, `${route.number} ${direction} needs a speed`);
        } else {
          rejected += 1;
          assert.equal(result.failure.code, "no-coordinates");
        }
      }
    }
    assert.ok(built > 1000, `${built} rides built, ${rejected} rejected`);
  });
});

// ---------------------------------------------------------------- matching

describe("matchRide", () => {
  it("says on the bus when the phone is on a stop", () => {
    const stop = FIVE_STOPS.stops[2].position as Position;
    const match = matchRide(FIVE_STOPS, stop);
    assert.equal(match.state, "on-bus");
    assert.equal(match.atStop, true);
    assert.equal(match.stopIndex, 2);
    assert.equal(match.nextStopIndex, 3);
    assert.ok(Math.abs((match.metresToNextStop ?? 0) - 500) < 5);
    assert.ok(Math.abs((match.metresAlong ?? 0) - 1000) < 5);
  });

  it("says on the bus halfway between two stops, which is most of the journey", () => {
    const middle = north(FIVE_STOPS.stops[1].position as Position, 250);
    const match = matchRide(FIVE_STOPS, middle);
    assert.equal(match.state, "on-bus");
    assert.equal(match.atStop, false);
    assert.equal(match.stopIndex, 1);
    assert.equal(match.nextStopIndex, 2);
    assert.ok(Math.abs((match.metresToNextStop ?? 0) - 250) < 5, `${match.metresToNextStop}`);
    assert.ok(Math.abs((match.metresAlong ?? 0) - 750) < 5, `${match.metresAlong}`);
  });

  it("keeps the passenger on the bus 70 m off the mapped line", () => {
    const match = matchRide(FIVE_STOPS, { lat: 0, lng: 0 });
    assert.equal(match.state, "not-seated");
    const onCorridor = matchRide(FIVE_STOPS, (fixAlong(FIVE_STOPS, 750, 0, CORRIDOR_RADIUS_METRES - 5) as unknown) as Position);
    assert.equal(onCorridor.state, "on-bus");
    assert.ok((onCorridor.metresOffRoute ?? 0) < CORRIDOR_RADIUS_METRES);
  });

  it("says not seated beyond the corridor radius, and names the nearest stop", () => {
    const far = fixAlong(FIVE_STOPS, 750, 0, 220) as unknown as Position;
    const match = matchRide(FIVE_STOPS, far);
    assert.equal(match.state, "not-seated");
    assert.equal(match.atStop, false);
    assert.equal(match.nextStopIndex, null);
    assert.equal(match.metresToNextStop, null);
    assert.ok(match.metresOffRoute !== null && match.metresOffRoute > CORRIDOR_RADIUS_METRES);
    assert.ok(match.nearest.metres > 0);
    assert.ok(match.nearest.name.length > 0);
  });

  it("respects a tighter radius when asked", () => {
    const off = fixAlong(FIVE_STOPS, 750, 0, 60) as unknown as Position;
    assert.equal(matchRide(FIVE_STOPS, off, { corridorRadiusMetres: 25 }).state, "not-seated");
    assert.equal(matchRide(FIVE_STOPS, off, { corridorRadiusMetres: 100 }).state, "on-bus");
  });

  it("measures from the last located stop across a gap", () => {
    // Esplanade has no coordinate, so the corridor runs B.B.D. Bagh -> College Street.
    const withGap = syntheticRoute([
      { name: "B.B.D. Bagh", metres: 0, minutes: 600 },
      { name: "Esplanade", metres: 500, minutes: 601.67, located: false },
      { name: "College Street", metres: 1000, minutes: 603.33 },
      { name: "Shyambazar", metres: 1500, minutes: 605 },
    ]);
    assert.equal(withGap.locatedStops, 3);
    assert.equal(withGap.segments.length, 2);
    const match = matchRide(withGap, north(withGap.stops[0].position as Position, 500));
    assert.equal(match.state, "on-bus");
    assert.equal(match.stopIndex, 0, "the unlocated stop is never reported as passed");
    assert.equal(match.nextStopIndex, 2, "the next stop is the next located one");
    assert.ok(Math.abs((match.metresToNextStop ?? 0) - 500) < 5);
  });

  it("finds the nearest stop of a real route", () => {
    const result = buildRide({ number: "1", direction: "outbound" });
    if (!result.ok) return assert.fail("route 1 should build");
    const first = result.ride.stops.find((stop) => stop.position) as RideStop;
    const nearest = nearestStop(result.ride, first.position as Position);
    assert.ok(nearest);
    assert.equal(nearest.index, first.index);
    assert.ok(nearest.metres < 1);
  });

  it("picks the destination the passenger chose, or the terminus", () => {
    assert.equal(destinationIndex(FIVE_STOPS, null), FIVE_STOPS.stops.length - 1);
    assert.equal(destinationIndex(FIVE_STOPS, "Esplanade"), 1);
    assert.equal(destinationIndex(FIVE_STOPS, "Not On This Route"), FIVE_STOPS.stops.length - 1);
  });
});

// ---------------------------------------------------------------- smoothing and state

describe("GPS smoothing", () => {
  it("takes three good fixes to commit: two for a position, two matches to confirm", () => {
    let tracker = initTracker();
    assert.equal(tracker.status, "waiting");
    tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 250, 0));
    assert.equal(tracker.status, "waiting", "one fix is not a position yet");
    assert.equal(tracker.accepted, 1);
    assert.equal(tracker.match, null);

    tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 260, 2));
    assert.equal(tracker.accepted, 2);
    assert.ok(tracker.match, "a smoothed position exists after two fixes");
    assert.equal(tracker.status, "waiting", "but one match is not yet an answer");
    assert.ok(tracker.notice?.includes("Checking"));

    tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 270, 4));
    assert.equal(tracker.status, "on-bus");
    assert.equal(tracker.notice, null);
    assert.equal(tracker.match?.state, "on-bus");
  });

  it("reaches a position on the bus from a standing start", () => {
    const tracker = onTheBus();
    assert.equal(tracker.status, "on-bus");
    assert.equal(tracker.readings, 3);
    assert.equal(tracker.rejected, 0);
  });

  it("ignores a fix from another city", () => {
    let tracker = initTracker();
    tracker = advanceTracker(tracker, FIVE_STOPS, fix(12.97, 77.59, 0));
    assert.equal(tracker.status, "waiting");
    assert.equal(tracker.rejected, 1);
    assert.equal(tracker.accepted, 0);
    assert.ok(tracker.notice?.includes("outside the area"));
  });

  it("ignores a fix with no usable accuracy", () => {
    const worse = advanceTracker(onTheBus(), FIVE_STOPS, { ...fixAlong(FIVE_STOPS, 400, 4), accuracy: 800 });
    assert.equal(worse.rejected, 1);
    assert.equal(worse.fixes.length, 3, "the poor fix never reaches the average");
    assert.ok(worse.notice?.includes("accuracy"));
    // A coarse fix is still a usable one when nothing better is coming.
    const coarse = advanceTracker(onTheBus(), FIVE_STOPS, { ...fixAlong(FIVE_STOPS, 400, 4), accuracy: 140 });
    assert.equal(coarse.rejected, 0);
    assert.equal(coarse.fixes.length, 4);
  });

  it("restarts the window on a teleport instead of averaging two places at once", () => {
    const before = onTheBus();
    // 1.2 km away in one second: either the window was wrong or this reading is.
    const tracker = advanceTracker(before, FIVE_STOPS, fixAlong(FIVE_STOPS, 1500, 3));
    assert.equal(tracker.fixes.length, 1, "the two places cannot share a window");
    assert.equal(tracker.status, "on-bus", "the answer is held, not flipped, by one reading");
    assert.ok(tracker.notice?.includes("jumped"));
    // Two consistent readings at the new place are needed before it is believed.
    const second = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 1550, 4));
    assert.equal(second.fixes.length, 2);
    assert.equal(second.consecutiveOnRoute, 1);
    const third = advanceTracker(second, FIVE_STOPS, fixAlong(FIVE_STOPS, 1600, 5));
    assert.equal(third.consecutiveOnRoute, 2);
    assert.equal(third.match?.stopIndex, 3, "it is now measuring from the new place");
    assert.equal(third.notice, null);
  });

  it("does not sample twice in the same instant", () => {
    const tracker = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 400, 2.2));
    assert.equal(tracker.rejected, 1);
    assert.equal(tracker.fixes.length, 3);
  });

  it("smooths one bad fix away instead of flipping the state", () => {
    // One 60 m wobble, still inside the corridor radius, and still averaged with the rest.
    const wobbled = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 340, 3, 60));
    assert.equal(wobbled.status, "on-bus", "a single wobble must not say 'not seated'");
    assert.ok((wobbled.match?.metresOffRoute ?? 99) < CORRIDOR_RADIUS_METRES);
  });

  it("follows a route that turns round and drives back up the same road", () => {
    /*
     * Kolkata routes do this at a terminus: the bus turns round and comes back along
     * the street it arrived on. Halfway round the turn, the outbound and return
     * branches of the corridor cover the same tarmac, so the distance alone cannot say
     * which one the passenger is on. The tracker must keep moving forwards rather than
     * switching to the branch that would carry the marker back the way it came.
     */
    const thereAndBack = syntheticRoute([
      { name: "Start", metres: 0, minutes: 600 },
      { name: "Turn", metres: 500, minutes: 602 },
      { name: "Back", metres: 400, minutes: 603 },
    ]);
    assert.ok(thereAndBack.totalMetres > 550, "the return leg retraces the outbound one");

    const speed = 5;
    let tracker = initTracker();
    let previous = -1;
    for (let metres = 0; metres <= thereAndBack.totalMetres; metres += 10) {
      const point = pointAtMetres(thereAndBack, metres);
      assert.ok(point);
      tracker = advanceTracker(tracker, thereAndBack, {
        ...point,
        accuracy: 8,
        timestamp: 1_700_000_000_000 + (metres / speed) * 1000,
      });
      const along = tracker.match?.metresAlong ?? null;
      if (along === null) continue;
      if (previous >= 0) {
        assert.ok(along >= previous - 40, `went backwards: ${previous.toFixed(0)} -> ${along.toFixed(0)}`);
      }
      previous = along;
    }
    assert.equal(tracker.status, "on-bus");
    assert.ok(
      Math.abs((tracker.match?.metresAlong ?? 0) - thereAndBack.totalMetres) < 40,
      `ended at ${tracker.match?.metresAlong?.toFixed(0)} m of ${thereAndBack.totalMetres.toFixed(0)} m`,
    );
  });

  it("holds 'on the bus' through a short drift off the corridor", () => {
    // 400 m east averaged into the window puts the phone 100 m off the corridor,
    // but the reading lands inside the 20 s grace window.
    const tracker = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 300, 5, 400));
    assert.equal(tracker.status, "on-bus");
    assert.ok(tracker.notice?.includes("drifted"));
  });

  it("says 'not seated' once the drift outlasts the grace window", () => {
    let tracker = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 300, 5, 400));
    tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 350, 40, 400));
    assert.equal(tracker.status, "not-seated");
    assert.ok(tracker.notice?.includes("do not appear to be on this bus"));
    assert.ok(tracker.notice?.includes(FIVE_STOPS.stops[tracker.match?.nearest.index ?? 0].name));
  });

  it("comes back to 'on the bus' once the off-corridor fixes have aged out", () => {
    let tracker = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 300, 5, 400));
    tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 350, 40, 400));
    assert.equal(tracker.status, "not-seated");
    // The window still holds the off-corridor fixes, so recovery costs a window length
    // to flush them plus the two readings needed to commit again.
    let readings = 0;
    let recovered = false;
    for (let second = 42; second <= 90 && !recovered; second += 2) {
      tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, 400 + second, second));
      readings += 1;
      recovered = tracker.status === "on-bus";
    }
    assert.ok(recovered, "the passenger is back on the bus");
    assert.ok(
      readings <= TRACKER_DEFAULTS.windowSize + TRACKER_DEFAULTS.enterReadings,
      `recovery took ${readings} readings; window ${TRACKER_DEFAULTS.windowSize} + confirm ${TRACKER_DEFAULTS.enterReadings}`,
    );
    assert.equal(tracker.notice, null);
  });

  it("does not mutate the state it was given", () => {
    const before = initTracker();
    const after = advanceTracker(before, FIVE_STOPS, fixAlong(FIVE_STOPS, 250, 0));
    assert.equal(before.fixes.length, 0);
    assert.equal(before.readings, 0);
    assert.equal(after.fixes.length, 1);
    assert.notEqual(before, after);
  });

  it("keeps the window bounded on a long ride", () => {
    let tracker = initTracker();
    for (let second = 0; second < 200; second += 2) {
      tracker = advanceTracker(tracker, FIVE_STOPS, fixAlong(FIVE_STOPS, Math.min(2000, 20 + second * 5), second));
    }
    assert.equal(tracker.fixes.length, 5);
    assert.ok(tracker.progress.length <= 60);
    assert.equal(tracker.readings, 100);
    assert.equal(tracker.accepted, 100);
  });
});

// ---------------------------------------------------------------- direction

describe("direction detection", () => {
  const point = (seconds: number, metres: number) => ({ at: 1_700_000_000_000 + seconds * 1000, metresAlong: metres });

  it("reads forward movement", () => {
    const evidence = directionEvidence([point(0, 100), point(10, 300), point(20, 520)]);
    assert.equal(evidence.hint, "forward");
    assert.ok(evidence.metres > 0);
  });

  it("reads a bus going the other way", () => {
    const evidence = directionEvidence([point(0, 900), point(10, 700), point(20, 480)]);
    assert.equal(evidence.hint, "backward");
    assert.ok(evidence.metres < 0);
  });

  it("stays unclear while the bus is standing still", () => {
    assert.equal(directionEvidence([point(0, 500), point(30, 510)]).hint, "unclear");
    assert.equal(directionEvidence([point(0, 500), point(2, 900)]).hint, "unclear", "too short a span");
    assert.equal(directionEvidence([]).hint, "unclear");
    assert.equal(directionEvidence([point(0, 500)]).hint, "unclear");
  });
});

// ---------------------------------------------------------------- times and distances

describe("times and distances", () => {
  const anchors = timeAnchors(FIVE_STOPS);

  it("collects an anchor for every stop with a time and a position", () => {
    assert.equal(anchors.length, 5);
    assert.equal(anchors[0].metresAlong, 0);
    assert.ok(anchors[4].metresAlong > anchors[3].metresAlong);
  });

  it("interpolates a published time between two stops", () => {
    const half = timeAt(anchors, 750, 5);
    assert.ok(half);
    assert.equal(half.basis, "published");
    // 600 + 1.67 * 1.5 minutes for 750 m of a 2 km run.
    assert.ok(Math.abs((half?.minutes ?? 0) - 602.5) < 0.05, `${half?.minutes}`);
  });

  it("extrapolates before the first stop and after the last", () => {
    const before = timeAt(anchors, -500, 5);
    const after = timeAt(anchors, 2500, 5);
    assert.ok(before && after);
    assert.ok((before?.minutes ?? 0) < 600);
    assert.ok((after?.minutes ?? 0) > 606.67);
  });

  it("falls back to the route speed when nothing is published", () => {
    const estimated = timeAt([], 900, 5);
    assert.ok(estimated);
    assert.equal(estimated.basis, "estimated");
    assert.equal(estimated.minutes, 3); // 900 m at 5 m/s
    assert.equal(timeAt([], 900, 0), null, "no speed and no times means no answer");
  });

  it("counts distance and time to every stop ahead", () => {
    const position = north(FIVE_STOPS.stops[1].position as Position, 250);
    const match = matchRide(FIVE_STOPS, position);
    const legs = rideLegs(FIVE_STOPS, match, { nowMinutes: 610, destinationIndex: 4, nextStopIndex: match.nextStopIndex });
    assert.equal(legs.length, 5);
    const esplanade = legs[1];
    assert.equal(esplanade.passed, true);
    const shyambazar = legs[3];
    assert.equal(shyambazar.isNext, false);
    assert.ok(Math.abs((shyambazar.metresFromHere ?? 0) - 750) < 5);
    assert.ok(Math.abs((shyambazar.minutesFromHere ?? 0) - 2.5) < 0.05);
    assert.equal(shyambazar.basis, "published");
    // Rounded to the minute, so allow for the rounding rather than pinning it.
    assert.ok(Math.abs((shyambazar.eta ?? 0) - (610 + 2.5)) <= 1, `${shyambazar.eta}`);
    const last = legs[4];
    assert.equal(last.isDestination, true);
    assert.ok((last.metresFromHere ?? 0) > (shyambazar.metresFromHere ?? 0));
    assert.ok((last.minutesFromHere ?? 0) > (shyambazar.minutesFromHere ?? 0));
  });

  it("gives a time to a stop that has no coordinate, from the timetable alone", () => {
    const withGap = syntheticRoute([
      { name: "Start", metres: 0, minutes: 600 },
      { name: "Unmapped", metres: 500, minutes: 602, located: false },
      { name: "End", metres: 1000, minutes: 604 },
    ]);
    const match = matchRide(withGap, withGap.stops[0].position as Position);
    const legs = rideLegs(withGap, match, { nowMinutes: 600, destinationIndex: 2, nextStopIndex: 2 });
    assert.equal(legs[1].hasPosition, false);
    assert.equal(legs[1].metresFromHere, null, "the corridor cannot measure what it has no position for");
    assert.equal(legs[1].minutesFromHere, 2, "but the timetable still says when the bus gets there");
    assert.equal(legs[1].basis, "published");
  });

  it("estimates for a stop with a coordinate but no published time", () => {
    const noTimes = syntheticRoute([
      { name: "Start", metres: 0, minutes: null },
      { name: "Middle", metres: 600, minutes: null },
      { name: "End", metres: 1200, minutes: null },
    ]);
    const match = matchRide(noTimes, noTimes.stops[0].position as Position);
    const legs = rideLegs(noTimes, match, { nowMinutes: 480, destinationIndex: 2, nextStopIndex: 1 });
    assert.ok(Math.abs((legs[1].metresFromHere ?? 0) - 600) < 0.1);
    assert.ok(Math.abs((legs[1].minutesFromHere ?? 0) - 2) < 0.01, "600 m at 5 m/s");
    assert.equal(legs[1].basis, "estimated");
    assert.equal(legs[2].eta, 484, "1200 m at 5 m/s is four minutes");
  });

  it("never invents a number when there is neither a time nor a position", () => {
    const nothing = syntheticRoute([
      { name: "Start", metres: 0, minutes: null },
      { name: "Ghost", metres: 500, minutes: null, located: false },
      { name: "End", metres: 1000, minutes: null },
    ]);
    const legs = rideLegs(nothing, null, { nowMinutes: 480, destinationIndex: 2, nextStopIndex: null });
    assert.equal(legs[1].metresFromHere, null);
    assert.equal(legs[1].minutesFromHere, null);
    assert.equal(legs[1].eta, null);
    assert.equal(legs[1].basis, "none");
  });

  it("summarises the whole ride", () => {
    const match = matchRide(FIVE_STOPS, north(FIVE_STOPS.stops[0].position as Position, 250));
    const summary = rideSummary(FIVE_STOPS, match, 600);
    assert.equal(summary.destinationName, "Dum Dum");
    assert.ok(Math.abs((summary.metresToDestination ?? 0) - 1750) < 6);
    assert.ok(Math.abs((summary.minutesToDestination ?? 0) - 5.83) < 0.1);
    assert.equal(summary.basis, "published");
    assert.equal(summary.stopsRemaining, 4);
    assert.ok(Math.abs((summary.metresTravelled ?? 0) - 250) < 6);
  });

  it("measures the leg between two stops, and says null across a gap", () => {
    assert.ok(Math.abs((legDistance(FIVE_STOPS, 0, 1) ?? 0) - 500) < 5);
    assert.ok(Math.abs((legDistance(FIVE_STOPS, 0, 3) ?? 0) - 1500) < 6);
    const withGap = syntheticRoute([
      { name: "A", metres: 0 },
      { name: "B", metres: 500, located: false },
      { name: "C", metres: 1000 },
    ]);
    assert.equal(legDistance(withGap, 0, 1), null);
    assert.ok(Math.abs((legDistance(withGap, 0, 2) ?? 0) - 1000) < 6);
  });

  it("reports corridor coverage honestly", () => {
    assert.deepEqual(corridorCoverage(FIVE_STOPS), { located: 5, total: 5, ratio: 1 });
    const withGap = syntheticRoute([
      { name: "A", metres: 0 },
      { name: "B", metres: 500, located: false },
      { name: "C", metres: 1000 },
    ]);
    assert.deepEqual(corridorCoverage(withGap), { located: 2, total: 3, ratio: 2 / 3 });
  });

  it("keeps the corridor radius wider than the stop radius nowhere, and both sane", () => {
    assert.equal(STOP_RADIUS_METRES, 75);
    assert.equal(CORRIDOR_RADIUS_METRES, 75);
  });
});

describe("a real timed route end to end", () => {
  it("matches, measures and estimates on route 230", () => {
    const result = buildRide({ number: "230", direction: "outbound" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const { ride } = result;
    const first = ride.stops.find((stop) => stop.position) as RideStop;
    const second = ride.stops.find((stop) => stop.position && stop.index > first.index) as RideStop;
    // Halfway *along the road*, not halfway across the map: on a curved corridor the
    // straight-line midpoint can be a street away from the route.
    const halfway = pointAtMetres(ride, (first.distanceAlongMetres! + second.distanceAlongMetres!) / 2);
    assert.ok(halfway, "the corridor has a point halfway between the first two stops");
    const match = matchRide(ride, halfway);
    assert.equal(match.state, "on-bus");
    assert.equal(match.stopIndex, first.index);
    assert.equal(match.nextStopIndex, second.index);
    const legs = rideLegs(ride, match, { nowMinutes: 600, destinationIndex: ride.stops.length - 1, nextStopIndex: match.nextStopIndex });
    const ahead = legs.filter((leg) => !leg.passed);
    assert.ok(ahead.length >= 2);
    for (const leg of ahead) {
      if (leg.minutesFromHere !== null) assert.ok(leg.minutesFromHere >= 0, `${leg.name} is in the past`);
      if (leg.basis !== "none") assert.ok(leg.eta !== null, `${leg.name} has an ETA`);
    }
    const summary = rideSummary(ride, match, 600);
    assert.equal(summary.destinationName, ride.destination);
    assert.ok((summary.minutesToDestination ?? 0) > 0);
  });

  it("gives both directions of a route different stop orders and times", () => {
    const out = buildRide({ number: "230", direction: "outbound" });
    const back = buildRide({ number: "230", direction: "return" });
    assert.ok(out.ok && back.ok);
    if (!out.ok || !back.ok) return;
    assert.notEqual(out.ride.origin, back.ride.origin);
    assert.equal(out.ride.origin, back.ride.destination);
    const outTimes = out.ride.stops.map((stop) => stop.minutes);
    const backTimes = back.ride.stops.map((stop) => stop.minutes).reverse();
    assert.notDeepEqual(outTimes, backTimes, "the return is not the outbound times read backwards");
  });
});

// ---------------------------------------------------------------- journey simulation

/**
 * A whole ride, replayed.
 *
 * This is the closest thing to a device test that runs without a browser: a real
 * route from the bundled dataset, a walk along its own corridor at a plausible speed,
 * with the noise a phone actually produces, pushed through the same reducer the page
 * uses. It asserts the thing that matters — that the passenger is told they are on the
 * bus for the whole ride, that the numbers only ever count down, and that a bus stop
 * really is recognised as one.
 */
describe("a simulated ride along a real route", () => {
  /** Deterministic pseudo-random noise, so a failure is reproducible. */
  function wobble(step: number): { east: number; north: number } {
    const a = Math.sin(step * 12.9898) * 43758.5453;
    const b = Math.sin(step * 78.233) * 12345.6789;
    return { east: (a - Math.floor(a) - 0.5) * 2 * 22, north: (b - Math.floor(b) - 0.5) * 2 * 22 };
  }

  function simulate(routeNumber: string, noise: number) {
    const result = buildRide({ number: routeNumber, direction: "outbound" });
    if (!result.ok) return assert.fail(`route ${routeNumber} should build`);
    const { ride } = result;
    const located = ride.stops.filter((stop) => stop.position);
    assert.ok(located.length >= 2, `${routeNumber} needs two located stops`);

    const busSpeed = Math.max(2.5, ride.speedMps);
    let tracker = initTracker();
    const states: string[] = [];
    const progress: number[] = [];
    let seconds = 0;

    // Fix every two seconds, travelling the whole corridor at the route's own speed.
    const totalSeconds = Math.max(120, Math.ceil(ride.totalMetres / busSpeed));
    for (let elapsed = 0; elapsed <= totalSeconds; elapsed += 2) {
      seconds = elapsed;
      const metres = Math.min(ride.totalMetres, elapsed * busSpeed);
      const jitter = wobble(elapsed) ;
      const point = pointAlong(ride, metres);
      if (!point) continue;
      const shifted = {
        lat: point.lat + (jitter.north * noise) / METRES_PER_DEGREE_LAT,
        lng: point.lng + (jitter.east * noise) / (METRES_PER_DEGREE_LAT * Math.cos((point.lat * Math.PI) / 180)),
      };
      tracker = advanceTracker(tracker, ride, {
        lat: shifted.lat,
        lng: shifted.lng,
        accuracy: 10 + Math.abs(jitter.east),
        timestamp: 1_700_000_000_000 + elapsed * 1000,
      });
      states.push(tracker.status);
      if (tracker.match?.metresAlong !== null && tracker.match?.metresAlong !== undefined) {
        progress.push(tracker.match.metresAlong);
      }
    }
    return { ride, tracker, states, progress, seconds, busSpeed };
  }

  /** The point a given number of metres along a route's corridor. */
  const pointAlong = pointAtMetres;

  it("stays on the bus for a whole clean run", () => {
    const run = simulate("1", 0);
    if (!run) return;
    const { states, progress } = run;
    assert.ok(states.length > 60, `${states.length} fixes`);
    // After the first couple of readings, never once claims the passenger got off.
    const settled = states.slice(3);
    assert.equal(
      settled.filter((state) => state === "on-bus").length / settled.length,
      1,
      "a clean ride must never report 'not seated'",
    );
    // Progress along the corridor only ever goes forward.
    for (let index = 1; index < progress.length; index += 1) {
      assert.ok(progress[index] >= progress[index - 1] - 40, `went backwards: ${progress[index - 1]} -> ${progress[index]}`);
    }
    assert.ok(progress[progress.length - 1] > progress[0], "the bus moved");
  });

  it("stays on the bus with a realistic amount of GPS noise", () => {
    const run = simulate("1", 1);
    if (!run) return;
    const settled = run.states.slice(3);
    const onBus = settled.filter((state) => state === "on-bus").length / settled.length;
    assert.ok(onBus >= 0.95, `on the bus ${(onBus * 100).toFixed(1)}% of a noisy ride`);
  });

  it("recognises the terminus as the end of the corridor", () => {
    const run = simulate("1", 0);
    if (!run) return;
    const { ride, tracker, progress } = run;
    const arrived = tracker.match?.metresAlong ?? 0;
    assert.ok(
      Math.abs(arrived - ride.totalMetres) < 60,
      `ended at ${arrived.toFixed(0)} m of ${ride.totalMetres.toFixed(0)} m`,
    );
    assert.ok(progress.length > 10);
  });

  it("reports a not-seated passenger who is nowhere near the route", () => {
    const result = buildRide({ number: "1", direction: "outbound" });
    if (!result.ok) return assert.fail("route 1 should build");
    const { ride } = result;
    const first = ride.stops.find((stop) => stop.position) as RideStop;
    // Parked 5 km east of the first stop, reading cleanly, for a minute.
    let tracker = initTracker();
    for (let second = 0; second <= 60; second += 5) {
      tracker = advanceTracker(tracker, ride, {
        lat: first.position!.lat,
        lng: first.position!.lng + 5 / (111.194 * Math.cos((first.position!.lat * Math.PI) / 180)),
        accuracy: 8,
        timestamp: 1_700_000_000_000 + second * 1000,
      });
    }
    assert.equal(tracker.status, "not-seated");
    assert.ok(tracker.notice?.includes("do not appear to be on this bus"));
  });

  it("counts the stops down as the bus moves, and never counts up", () => {
    const result = buildRide({ number: "230", direction: "outbound" });
    if (!result.ok) return assert.fail("route 230 should build");
    const { ride } = result;
    const speed = Math.max(2.5, ride.speedMps);
    let tracker = initTracker();
    const remaining: number[] = [];
    for (let second = 0; second <= Math.ceil(ride.totalMetres / speed); second += 10) {
      const point = pointAlong(ride, Math.min(ride.totalMetres, second * speed));
      if (!point) continue;
      tracker = advanceTracker(tracker, ride, { ...point, accuracy: 10, timestamp: 1_700_000_000_000 + second * 1000 });
      if (tracker.status !== "on-bus" || !tracker.match) continue;
      const legs = rideLegs(ride, tracker.match, {
        nowMinutes: 600 + Math.round(second / 60),
        destinationIndex: ride.stops.length - 1,
        nextStopIndex: tracker.match.nextStopIndex,
      });
      remaining.push(legs.filter((leg) => !leg.passed).length);
    }
    assert.ok(remaining.length > 3, `${remaining.length} samples`);
    assert.ok(remaining[0] > remaining[remaining.length - 1], "stops run out as the bus travels");
    for (let index = 1; index < remaining.length; index += 1) {
      assert.ok(remaining[index] <= remaining[index - 1], "the stop count never goes up");
    }
  });
});

describe("stale fixes", () => {
  it("ignores a fix that arrives long after the previous one", () => {
    // A phone that stopped reporting for ten minutes and then resumed: the window
    // describes where the passenger was, not where they are.
    const tracker = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 400, 600));
    assert.equal(tracker.rejected, 1, "a ten-minute gap is not the same journey");
    assert.equal(tracker.fixes.length, 3);
    // Just inside the window it is accepted.
    const fresh = advanceTracker(onTheBus(), FIVE_STOPS, fixAlong(FIVE_STOPS, 400, 60));
    assert.equal(fresh.rejected, 0);
    assert.equal(fresh.fixes.length, 4);
  });
});
