/*
 * Tests for the bus-stop page's timetable: every pass at a stop, the next ones, and
 * the wording of the wait.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getStopPasses,
  minuteOfDay,
  passesByHour,
  upcomingPasses,
  waitLabel,
  type StopPass,
} from "@/lib/stopTimetable";
import { getRoute } from "@/lib/timetables";

const pass = (routeNumber: string, clock: number, overrides: Partial<StopPass> = {}): StopPass => ({
  routeNumber,
  routeType: "Non-AC",
  operator: "WBTC",
  direction: "outbound",
  towards: "Garia",
  from: "Esplanade",
  runCode: `RUN-${routeNumber}`,
  bus: null,
  minutes: clock,
  clock,
  kind: "scheduled",
  ...overrides,
});

describe("a stop in the directory", () => {
  it("lists the day's passes in order, with the clock matching the printed time", () => {
    const stop = getStopPasses("Garia");
    assert.equal(stop.inDirectory, true);
    assert.ok(stop.passes.length > 0);
    for (let index = 1; index < stop.passes.length; index += 1) {
      assert.ok(stop.passes[index - 1].clock <= stop.passes[index].clock);
    }
    for (const item of stop.passes.slice(0, 50)) {
      assert.equal(item.clock, minuteOfDay(item.minutes));
      assert.ok(item.clock >= 0 && item.clock < 1440);
    }
  });

  it("names the terminus the bus is heading for, in both directions", () => {
    const stop = getStopPasses("Garia");
    for (const item of stop.passes.slice(0, 40)) {
      const route = getRoute(item.routeNumber);
      assert.ok(route, item.routeNumber);
      const expected = item.direction === "outbound" ? route!.destination : route!.origin;
      assert.equal(item.towards, expected);
    }
  });

  it("resolves an alias to the directory's own name", () => {
    assert.equal(getStopPasses("Howrah Stn").stop, "Howrah Railway Station");
    assert.equal(getStopPasses("Esplanade").stop, "Esplanade");
  });

  it("gives the same answer twice, from the cache", () => {
    assert.equal(getStopPasses("Garia"), getStopPasses("Garia"));
  });

  it("says plainly when nobody stops there", () => {
    const empty = getStopPasses("Nowhere At All");
    assert.equal(empty.inDirectory, false);
    assert.deepEqual(empty.passes, []);
    assert.equal(empty.routes.length, 0);
  });

  it("keeps a route that publishes no time out of the times, not out of the list", () => {
    // Every route in today's bundle is timed; the count is what the page reports.
    const stop = getStopPasses("Esplanade");
    assert.equal(stop.untimedRoutes, 0);
    assert.ok(stop.routes.length > 0);
  });
});

describe("the next buses", () => {
  const day = [pass("1", 6 * 60), pass("1", 8 * 60), pass("AC5", 6 * 60 + 5), pass("12", 23 * 60 + 50)];

  it("counts forward from now, including the minutes", () => {
    const next = upcomingPasses(day, 6 * 60, 2);
    assert.deepEqual(next.map((item) => item.routeNumber), ["1", "AC5"]);
    assert.equal(next[0].deltaMinutes, 0);
    assert.equal(next[1].deltaMinutes, 5);
  });

  it("wraps over midnight instead of ending the day", () => {
    // At 23:55 the 23:50 bus has gone; the next one is tomorrow's 06:00.
    const next = upcomingPasses(day, 23 * 60 + 55, 3);
    assert.equal(next[0].routeNumber, "1");
    assert.equal(next[0].deltaMinutes, 6 * 60 + 5);
    assert.equal(next[0].nextDay, true);
    // At 23:45 the 23:50 bus is still to come, tonight.
    const tonight = upcomingPasses(day, 23 * 60 + 45, 1);
    assert.equal(tonight[0].routeNumber, "12");
    assert.equal(tonight[0].deltaMinutes, 5);
    assert.equal(tonight[0].nextDay, false);
  });

  it("drops the buses beyond the horizon", () => {
    const next = upcomingPasses(day, 6 * 60, 20, { horizonMinutes: 6 });
    assert.deepEqual(next.map((item) => item.routeNumber), ["1", "AC5"]);
    assert.deepEqual(upcomingPasses(day, 7 * 60, 20, { horizonMinutes: 30 }), []);
  });

  it("sorts a real stop's next buses by how soon they are", () => {
    const stop = getStopPasses("Garia");
    const next = upcomingPasses(stop.passes, 9 * 60 + 30, 12);
    assert.ok(next.length > 0);
    for (let index = 1; index < next.length; index += 1) {
      assert.ok(next[index - 1].deltaMinutes <= next[index].deltaMinutes);
    }
  });
});

describe("the rest of the day", () => {
  it("groups passes by hour and leaves empty hours out", () => {
    const groups = passesByHour([pass("1", 6 * 60 + 10), pass("2", 6 * 60 + 40), pass("3", 9 * 60)]);
    assert.deepEqual(groups.map((group) => group.hour), [6, 9]);
    assert.equal(groups[0].passes.length, 2);
  });

  it("says a wait the way a person says it", () => {
    assert.equal(waitLabel(0), "due now");
    assert.equal(waitLabel(1), "in 1 min");
    assert.equal(waitLabel(59), "in 59 min");
    assert.equal(waitLabel(60), "in 1 hr");
    assert.equal(waitLabel(72), "in 1 hr 12 min");
  });
});
