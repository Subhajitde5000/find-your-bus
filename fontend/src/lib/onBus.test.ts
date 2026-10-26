/*
 * Tests for identifying the bus from a position and the clock, and for reading a
 * direction off one GPS fix per direction.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseDirection,
  confidenceFor,
  describeIdentification,
  identifyBus,
  minuteOfDay,
  offsetAgainstNow,
  passageClock,
  rankRuns,
  runLabel,
  runTimesAtMetres,
  runTimesAtIndex,
  stopsAhead,
  type DirectionReading,
  type TimedRun,
} from "@/lib/onBus";
import { buildRide, matchRide } from "@/lib/ride";
import { getRouteRuns } from "@/lib/timetables";

const runs: TimedRun[] = [
  { runCode: "A", bus: null, minutes: 480 },
  { runCode: "B", bus: null, minutes: 495 },
  { runCode: "C", bus: null, minutes: 510 },
  { runCode: "D", bus: null, minutes: null },
];

describe("time on the service day", () => {
  it("wraps a minute into the day", () => {
    assert.equal(minuteOfDay(0), 0);
    assert.equal(minuteOfDay(1445), 5);
    assert.equal(minuteOfDay(-15), 1425);
  });

  it("compares a printed time with the nearest copy of now", () => {
    assert.equal(offsetAgainstNow(490, 480), 10);
    assert.equal(offsetAgainstNow(470, 480), -10);
    // A run that reaches this stop at 00:10 (1450) against a 00:30 clock: it left 20 min ago.
    assert.equal(offsetAgainstNow(1450, 30), -20);
    // …and the same printed time against 23:50 is 20 minutes in the future, tomorrow.
    assert.equal(offsetAgainstNow(1450, 1430), 20);
    // A first run at 00:10 against 23:50 is 20 minutes away.
    assert.equal(offsetAgainstNow(10, 1430), 20);
  });
});

describe("ranking the buses", () => {
  it("puts the nearest printed time first and drops runs with no time", () => {
    const ranked = rankRuns(runs, 494, 15);
    assert.deepEqual(ranked.map((run) => run.runCode), ["B", "A", "C"]);
    assert.equal(ranked[0].offsetMinutes, 1);
    assert.equal(ranked.length, 3);
  });

  it("scales the tolerance with the headway", () => {
    // Every 8 minutes: a 20-minute error cannot be the same bus.
    assert.equal(confidenceFor(0, 8), "likely");
    assert.equal(confidenceFor(20, 8), "unclear");
    // Every 60 minutes: 20 minutes off is normal.
    assert.equal(confidenceFor(20, 60), "possible");
    assert.equal(confidenceFor(60, 60), "unclear");
    assert.equal(confidenceFor(null, 20), "unclear");
  });

  it("says it is unsure when nothing is close", () => {
    const id = identifyBus(runs, 700, 15);
    assert.equal(id.unsure, true);
    assert.equal(id.best?.runCode, "C");
    assert.equal(id.best?.offsetMinutes, 510 - 700);
  });

  it("has no best candidate when no time is published", () => {
    const id = identifyBus([{ runCode: "D", bus: null, minutes: null }], 500, null);
    assert.equal(id.best, null);
    assert.equal(id.unsure, true);
    assert.equal(runLabel({ runCode: null, bus: "WB 04 A 1234", minutes: null }, 0), "Bus WB 04 A 1234");
  });
});

describe("interpolating along the corridor", () => {
  it("puts a run between the two printed times that bracket the position", () => {
    const built = buildRide({ number: "1", direction: "outbound", atMinute: 480 });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const ride = built.ride;
    const timetable = getRouteRuns("1", "outbound");
    assert.ok(timetable && timetable.runs.length > 0);
    if (!timetable) return;

    // A stop whose position is unknown has no distance along the corridor, so the
    // interpolation has to be checked between two stops that are both located.
    const located = ride.stops.filter((stop) => stop.distanceAlongMetres !== null);
    assert.ok(located.length >= 2);
    const first = located[0];
    const second = located[1];
    const times = runTimesAtMetres(ride, timetable.runs, (first.distanceAlongMetres! + second.distanceAlongMetres!) / 2);
    const printed = timetable.runs[0].times;
    assert.ok(printed[first.index] !== null && printed[second.index] !== null);
    const value = times[0].minutes;
    assert.ok(value !== null);
    assert.ok(value! > Math.min(printed[first.index]!, printed[second.index]!) - 0.001);
    assert.ok(value! < Math.max(printed[first.index]!, printed[second.index]!) + 0.001);
  });

  it("reads a stop index straight out of a run", () => {
    const timetable = getRouteRuns("1", "outbound");
    assert.ok(timetable);
    if (!timetable) return;
    const times = runTimesAtIndex(timetable.runs, 0);
    assert.equal(times.length, timetable.runs.length);
    assert.equal(times[0].minutes, timetable.runs[0].times[0]);
  });

  it("returns no times when the position is unknown", () => {
    const built = buildRide({ number: "1", direction: "outbound", atMinute: 480 });
    if (!built.ok) return;
    const timetable = getRouteRuns("1", "outbound");
    if (!timetable) return;
    assert.deepEqual(
      runTimesAtMetres(built.ride, timetable.runs, null).map((run) => run.minutes),
      timetable.runs.map(() => null),
    );
  });
});

describe("choosing the direction", () => {
  const reading = (direction: "outbound" | "return", onCorridor: boolean, metresOffRoute: number | null): DirectionReading => ({
    direction,
    onCorridor,
    metresOffRoute,
    metresAlong: 0,
  });

  it("takes the only direction the phone is on", () => {
    assert.deepEqual(chooseDirection([reading("outbound", true, 12), reading("return", false, 400)]), {
      direction: "outbound",
      ambiguous: false,
    });
  });

  it("takes the closer direction when both match", () => {
    assert.deepEqual(chooseDirection([reading("outbound", true, 40), reading("return", true, 6)]), {
      direction: "return",
      ambiguous: false,
    });
  });

  it("says so when the two directions are the same piece of road", () => {
    const chosen = chooseDirection([reading("outbound", true, 10), reading("return", true, 18)]);
    assert.equal(chosen.ambiguous, true);
  });

  it("says nothing when the phone is off both corridors", () => {
    assert.deepEqual(chooseDirection([reading("outbound", false, 800), reading("return", false, 900)]), {
      direction: null,
      ambiguous: false,
    });
  });
});

describe("the identification card's wording", () => {
  it("prints a passage time the way the rest of the site does", () => {
    assert.equal(passageClock(0), "12:00 AM");
    assert.equal(passageClock(14 * 60 + 5), "02:05 PM");
    assert.equal(passageClock(null), "—");
    // The time at a stop between two anchors is interpolated, so it is a fraction.
    assert.equal(passageClock(8 * 60 + 10.688526654619864), "08:11 AM");
  });

  it("names the stop and the printed time when it is confident", () => {
    const described = describeIdentification(
      { runCode: "A", bus: null, minutes: 480, scheduledMinutes: 480, offsetMinutes: 2, confidence: "likely" },
      { stopName: "Garia", stopMinutes: 480, nowMinutes: 482 },
    );
    assert.match(described.title, /most likely/i);
    assert.match(described.detail, /Garia at 08:00 AM/);
    assert.match(described.detail, /2 minutes/);
  });

  it("admits when the nearest bus is far from the clock", () => {
    const described = describeIdentification(
      { runCode: "A", bus: null, minutes: 480, scheduledMinutes: 480, offsetMinutes: -90, confidence: "unclear" },
      { stopName: null, stopMinutes: null, nowMinutes: 570 },
    );
    assert.match(described.title, /No bus matches/i);
    assert.match(described.detail, /90 minutes/);
  });
});

describe("the route's own stops", () => {
  it("lists only the stops after the one the passenger is at", () => {
    const built = buildRide({ number: "1", direction: "outbound" });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const ahead = stopsAhead(built.ride, 2);
    assert.ok(ahead.every((stop) => stop.index > 2));
    assert.equal(ahead.length, built.ride.stops.length - 3);
    assert.equal(stopsAhead(built.ride, null).length, built.ride.stops.length - 1);
  });

  it("matches a real position to a real route, which is what the screen runs on", () => {
    const built = buildRide({ number: "1", direction: "outbound", atMinute: 480 });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const located = built.ride.stops.find((stop) => stop.position);
    assert.ok(located?.position);
    const match = matchRide(built.ride, located!.position!);
    assert.equal(match.state, "on-bus");
    assert.equal(match.atStop, true);
  });
});
