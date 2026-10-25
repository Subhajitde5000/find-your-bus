/*
 * Tests for identifying the bus from a stop and the clock.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EARLY_WINDOW_MINUTES,
  LATE_WINDOW_MINUTES,
  guessStops,
  identifyBusRun,
  offsetFromNow,
  passagesFor,
  serviceWindow,
  stopsAhead,
  travelMinutes,
} from "@/lib/onBus";
import { getRoute, getRouteStops, getStopPassages } from "@/lib/timetables";
import { stopPosition } from "@/lib/coords";
import type { StopPassage } from "@/lib/timetables";

function passage(minutes: number, runCode = `RUN-${minutes}`): StopPassage {
  return {
    route: "9",
    operator: "Test",
    type: "Non-AC",
    source: "directory",
    direction: "outbound",
    origin: "A",
    destination: "Z",
    runCode,
    bus: null,
    minutes,
    kind: "scheduled",
    stopIndex: 1,
    stopCount: 4,
    notes: null,
  };
}

describe("offsetFromNow", () => {
  it("measures lateness inside a day that crosses midnight", () => {
    // A run published at 00:10 is 30 minutes ahead of 23:40, not nineteen hours behind.
    assert.equal(offsetFromNow(1450, 1420), 30);
    // And a run at 00:10 has already gone when the clock says 01:00.
    assert.equal(offsetFromNow(1450, 60), -50);
    assert.equal(offsetFromNow(600, 600), 0);
  });
});

describe("identifying a bus", () => {
  const runs = [passage(600), passage(620), passage(640)];

  it("picks the run that should be at the stop now", () => {
    const result = identifyBusRun(runs, 601);
    assert.equal(result.state, "identified");
    assert.equal(result.best?.passage.minutes, 600);
    assert.equal(result.best?.verdict, "on-time");
    // Only runs within the late/early windows are candidates at all.
    assert.deepEqual(result.candidates.map((candidate) => candidate.passage.minutes), [600]);
  });

  it("names a late bus as late rather than switching to the next one", () => {
    const result = identifyBusRun(runs, 628);
    assert.equal(result.best?.passage.minutes, 620);
    assert.equal(result.best?.verdict, "late");
    assert.match(result.best?.label ?? "", /8 mins late/);
  });

  it("prefers a slightly late bus over a slightly early one", () => {
    // 09:58 with runs at 10:00 (2 min away) and 09:50 (8 min late): the late one wins,
    // because a bus that has not left early is the ordinary case.
    const result = identifyBusRun([passage(590), passage(600)], 598);
    assert.equal(result.best?.passage.minutes, 590);
    assert.equal(result.best?.verdict, "late");
    assert.equal(result.best?.confidence, "medium");
  });

  it("drops a run once it is later than the late window", () => {
    const result = identifyBusRun([passage(600), passage(700)], 600 + LATE_WINDOW_MINUTES + 1);
    assert.equal(result.candidates.some((candidate) => candidate.passage.minutes === 600), false);
  });

  it("does not pretend a run far in the future is this bus", () => {
    const result = identifyBusRun([passage(600), passage(700)], 600 + 60);
    // The 700 run is still ahead but well outside the early window.
    assert.equal(result.state, "outside-service");
    assert.equal(result.next?.minutes, 700);
  });

  it("never counts a bus more than a few minutes early", () => {
    const result = identifyBusRun([passage(600)], 600 - EARLY_WINDOW_MINUTES - 1);
    assert.equal(result.state, "outside-service");
  });

  it("says so when the day has not started or has finished", () => {
    const before = identifyBusRun([passage(360), passage(1200)], 300);
    assert.equal(before.state, "outside-service");
    assert.match(before.message, /first bus/i);
    const after = identifyBusRun([passage(360), passage(600)], 660);
    assert.equal(after.state, "outside-service");
  });

  it("has nothing to say without a published time", () => {
    const result = identifyBusRun([], 600);
    assert.equal(result.state, "no-times");
    assert.equal(result.best, null);
  });

  it("is less certain when two runs are minutes apart", () => {
    const close = identifyBusRun([passage(600), passage(604)], 602);
    assert.notEqual(close.best?.confidence, "high");
    const alone = identifyBusRun([passage(600), passage(700)], 601);
    assert.equal(alone.best?.confidence, "high");
  });

  it("reports the published service window", () => {
    assert.deepEqual(serviceWindow([passage(600), passage(660)]), { first: 600, last: 660, count: 2 });
    assert.deepEqual(serviceWindow([]), { first: null, last: null, count: 0 });
  });
});

describe("using the real directory", () => {
  it("finds a stop from a position, nearest first", () => {
    const route = getRoute("1");
    assert.ok(route);
    const stop = getRouteStops("1", "outbound").find((name) => stopPosition(name));
    assert.ok(stop);
    const place = stopPosition(stop as string);
    assert.ok(place);
    const guesses = guessStops("1", "outbound", place as { lat: number; lng: number });
    assert.ok(guesses.length > 0);
    assert.equal(guesses[0].name, stop);
    assert.equal(guesses[0].level, "at-stop");
    assert.ok(guesses[0].inDirection);
  });

  it("ignores a position nowhere near the route", () => {
    assert.deepEqual(guessStops("1", "outbound", { lat: 26.9, lng: 75.8 }, { maxMetres: 2000 }), []);
  });

  it("builds passages for one route and direction only", () => {
    const route = getRoute("1");
    assert.ok(route);
    const stop = getRouteStops("1", "outbound")[1];
    const passages = passagesFor("1", "outbound", stop);
    assert.ok(passages.length > 0);
    assert.equal(new Set(passages.map((item) => item.route)).size, 1);
    assert.ok(passages.every((item) => item.direction === "outbound"));
    assert.ok(passages.every((item) => item.runCode !== null));
    // Every passage must be a published time, in order.
    const times = passages.map((item) => item.minutes);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));
  });

  it("lists the stops still ahead, and none behind", () => {
    const stops = getRouteStops("1", "outbound");
    const ahead = stopsAhead("1", "outbound", stops[0]);
    assert.deepEqual(ahead, stops.slice(1));
    assert.deepEqual(stopsAhead("1", "outbound", stops[stops.length - 1]), []);
    assert.deepEqual(stopsAhead("1", "outbound", "not on this route"), []);
  });

  it("measures the published time between two stops of one run", () => {
    const stops = getRouteStops("1", "outbound");
    const run = getStopPassages(stops[1], { route: "1", direction: "outbound" })[0];
    assert.ok(run?.runCode);
    const minutes = travelMinutes("1", "outbound", stops[1], stops[3], run.runCode);
    assert.ok(minutes !== null && minutes > 0);
    assert.equal(travelMinutes("1", "outbound", stops[3], stops[1], run.runCode), null, "backwards is not a journey");
  });
});
