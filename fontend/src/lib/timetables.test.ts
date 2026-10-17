/*
 * Regression tests for journey search.
 *
 * The bug these guard against: searching A -> B and B -> A returned the same buses at the same
 * times, because departures were generated from a fixed 06:00, 06:25, ... pattern that ignored the
 * route and the direction. The rules below hold for EVERY route and EVERY pair of its stops, in
 * both directions, using the real bundled dataset.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dataset from "@/data/kolkata-bus-data.json";
import {
  canonicalStop,
  findRouteLinks,
  findTransferPlans,
  findTrips,
  POPULAR_JOURNEYS,
  resolveStop,
  searchStops,
  STOP_ALIASES,
  STOPS,
  type BusTrip,
} from "@/lib/timetables";

interface RawRun {
  run: string;
  out: [string, string];
  ret: [string, string];
}
interface RawRoute {
  number: string;
  source: "directory" | "preview";
  stops: string[];
  trips: RawRun[];
  frequency?: unknown;
}

const routes = dataset.routes as unknown as RawRoute[];
const clock = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
const hasTimes = (route: RawRoute) => (route.source === "preview" ? Boolean(route.frequency) : route.trips.length > 0);
const timesKey = (trips: BusTrip[]) => trips.map((trip) => `${trip.departure}-${trip.arrival}`).sort().join("|");
/** A published arrival earlier than its departure means the run crosses midnight. */
const runWindow = (departure: string, arrival: string): [number, number] => {
  const from = clock(departure);
  const to = clock(arrival);
  return [from, to < from ? to + 1440 : to];
};

interface PairCase {
  route: RawRoute;
  i: number;
  j: number;
  a: string;
  b: string;
  forward: BusTrip[];
  reverse: BusTrip[];
}

// Every route, every ordered pair of its stops (i before j), searched both ways. Built once.
const cases: PairCase[] = [];
for (const route of routes) {
  for (let i = 0; i < route.stops.length; i += 1) {
    for (let j = i + 1; j < route.stops.length; j += 1) {
      const a = route.stops[i];
      const b = route.stops[j];
      cases.push({
        route,
        i,
        j,
        a,
        b,
        forward: findTrips(a, b).filter((trip) => trip.number === route.number),
        reverse: findTrips(b, a).filter((trip) => trip.number === route.number),
      });
    }
  }
}
const label = (c: PairCase) => `${c.route.number}: ${c.a} <-> ${c.b}`;

describe("a journey and its reverse (every route, every stop pair)", () => {
  it("covers the whole dataset", () => {
    assert.ok(routes.length > 400, "expected the full directory");
    assert.ok(cases.length > 5000, "expected thousands of stop pairs");
  });

  it("never produces a made-up trip kind", () => {
    const allowed = new Set(["scheduled", "approximate", "sample"]);
    for (const c of cases) {
      for (const trip of [...c.forward, ...c.reverse]) {
        assert.ok(allowed.has(trip.kind), `${label(c)} has trip kind "${trip.kind}"`);
      }
    }
  });

  it("boards and alights where you searched, travelling the right way", () => {
    for (const c of cases) {
      const last = c.route.stops.length - 1;
      for (const trip of c.forward) {
        assert.equal(trip.boarding, c.a, label(c));
        assert.equal(trip.alighting, c.b, label(c));
        assert.equal(trip.terminusFrom, c.route.stops[0], `${label(c)} forward must start at the first stop`);
        assert.equal(trip.terminusTo, c.route.stops[last], label(c));
      }
      for (const trip of c.reverse) {
        assert.equal(trip.boarding, c.b, label(c));
        assert.equal(trip.alighting, c.a, label(c));
        assert.equal(trip.terminusFrom, c.route.stops[last], `${label(c)} reverse must start at the last stop`);
        assert.equal(trip.terminusTo, c.route.stops[0], label(c));
      }
    }
  });

  it("lists the stops in travel order, with unique trip ids", () => {
    for (const c of cases) {
      for (const trip of c.forward) {
        assert.deepEqual(trip.fullStops.map((s) => s.name), c.route.stops, label(c));
      }
      for (const trip of c.reverse) {
        assert.deepEqual(trip.fullStops.map((s) => s.name), [...c.route.stops].reverse(), label(c));
      }
      const ids = [...c.forward, ...c.reverse].map((trip) => trip.id);
      assert.equal(new Set(ids).size, ids.length, `${label(c)} has duplicate trip ids`);
    }
  });

  it("gives a route with no published times no trips, only a route link in the right direction", () => {
    let checked = 0;
    for (const c of cases.filter((x) => !hasTimes(x.route))) {
      checked += 1;
      assert.equal(c.forward.length + c.reverse.length, 0, `${label(c)} must not have invented times`);
      const forward = findRouteLinks(c.a, c.b).filter((l) => l.number === c.route.number);
      const reverse = findRouteLinks(c.b, c.a).filter((l) => l.number === c.route.number);
      assert.deepEqual(forward.map((l) => [l.direction, l.boarding, l.alighting]), [["outbound", c.a, c.b]], label(c));
      assert.deepEqual(reverse.map((l) => [l.direction, l.boarding, l.alighting]), [["return", c.b, c.a]], label(c));
    }
    assert.ok(checked > 1000, "expected many routes without timetables to be exercised");
  });

  it("never lists a route as a link when it already has times", () => {
    for (const c of cases.filter((x) => hasTimes(x.route))) {
      assert.equal(findRouteLinks(c.a, c.b).filter((l) => l.number === c.route.number).length, 0, label(c));
    }
  });

  it("uses the real terminal times for terminal-to-terminal journeys, outbound one way and return the other", () => {
    let checked = 0;
    for (const c of cases.filter((x) => x.route.source === "directory" && x.route.trips.length && x.i === 0 && x.j === x.route.stops.length - 1)) {
      checked += 1;
      assert.deepEqual(
        c.forward.map((t) => t.departure).sort((p, q) => p - q),
        c.route.trips.map((run) => clock(run.out[0])).sort((p, q) => p - q),
        `${label(c)} forward departures must be the outbound times`,
      );
      assert.deepEqual(
        c.reverse.map((t) => t.departure).sort((p, q) => p - q),
        c.route.trips.map((run) => clock(run.ret[0])).sort((p, q) => p - q),
        `${label(c)} reverse departures must be the return times`,
      );
      assert.ok(c.forward.every((t) => t.kind === "scheduled" && !t.departureApprox && !t.arrivalApprox), label(c));
    }
    assert.ok(checked >= 80, "expected the timetabled routes to be exercised");
  });

  it("derives middle-stop times from the real run, marks them approximate, and keeps them in order", () => {
    let checked = 0;
    for (const c of cases.filter((x) => x.route.source === "directory" && x.route.trips.length && !(x.i === 0 && x.j === x.route.stops.length - 1))) {
      checked += 1;
      const last = c.route.stops.length - 1;
      assert.equal(c.forward.length, c.route.trips.length, label(c));
      assert.equal(c.reverse.length, c.route.trips.length, label(c));
      assert.ok(c.forward.every((t) => t.kind === "approximate") && c.reverse.every((t) => t.kind === "approximate"), label(c));

      for (const run of c.route.trips) {
        const outId = `${run.run}-outbound-${c.i}-${c.j}`;
        const trip = c.forward.find((t) => t.id === outId);
        assert.ok(trip, `${label(c)} missing ${outId}`);
        const [dep, arr] = runWindow(run.out[0], run.out[1]);
        const at = (index: number) => Math.round(dep + ((arr - dep) * index) / last);
        assert.equal(trip.departure, at(c.i), `${label(c)} departure`);
        assert.ok(trip.departure >= dep && trip.departure <= arr, `${label(c)} stays within the real run`);
        // Pinned to the ALIGHTING index. Without this, computing the arrival from the boarding
        // index (or from anything else) still passes every other test in this file.
        assert.equal(trip.arrival, Math.max(at(c.i) + 1, at(c.j)), `${label(c)} arrival`);
        // The ride gets longer the further apart the two stops are, never shorter.
        if (c.i === 0) assert.equal(trip.arrival, at(c.j), `${label(c)} arrival from the first stop`);
        assert.ok(trip.arrival > trip.departure, `${label(c)} arrival must be after departure`);
        assert.ok(trip.arrival <= arr, `${label(c)} arrival must be inside the real run`);
        assert.equal(trip.arrival - trip.departure, Math.max(1, at(c.j) - at(c.i)), `${label(c)} journey time`);
        assert.equal(trip.duration, trip.arrival - trip.departure, `${label(c)} duration`);
        assert.equal(trip.departureApprox, c.i !== 0, label(c));
        assert.equal(trip.arrivalApprox, c.j !== last, label(c));
      }
      for (const run of c.route.trips) {
        // reverse journey: the bus travels the other way, so the return times apply, with positions mirrored
        const boardIndex = last - c.j;
        const alightIndex = last - c.i;
        const trip = c.reverse.find((t) => t.id === `${run.run}-return-${boardIndex}-${alightIndex}`);
        assert.ok(trip, `${label(c)} missing reverse trip for ${run.run}`);
        const [dep, arr] = runWindow(run.ret[0], run.ret[1]);
        const at = (index: number) => Math.round(dep + ((arr - dep) * index) / last);
        assert.equal(trip.departure, at(boardIndex), `${label(c)} reverse departure`);
        assert.equal(trip.arrival, Math.max(at(boardIndex) + 1, at(alightIndex)), `${label(c)} reverse arrival`);
        assert.ok(trip.departure >= dep && trip.arrival <= arr, `${label(c)} reverse stays within the real run`);
      }
    }
    assert.ok(checked > 1000, "expected many middle-stop searches to be exercised");
  });

  it("never shows the same times in both directions (the original bug)", () => {
    let checked = 0;
    for (const c of cases) {
      if (c.route.source !== "directory" || !c.forward.length || !c.reverse.length) continue;
      // Only meaningful when the route's own outbound and return times differ, which they do in the data.
      if (c.route.trips.every((run) => run.out[0] === run.ret[0] && run.out[1] === run.ret[1])) continue;
      checked += 1;
      assert.notEqual(timesKey(c.forward), timesKey(c.reverse), `${label(c)} shows identical times both ways`);
    }
    assert.ok(checked > 1000, "expected the direction check to be exercised");
  });

  it("can trace every timed trip back to a published run or frequency", () => {
    let traced = 0;
    for (const c of cases) {
      for (const trip of [...c.forward, ...c.reverse]) {
        if (trip.kind === "sample") {
          assert.ok(c.route.frequency, `${label(c)} sample trip on a route with no frequency`);
          continue;
        }
        // A directory trip must name the run it came from, and the run must be a real row.
        const run = c.route.trips.find((candidate) => candidate.run === trip.runCode);
        assert.ok(run, `${label(c)} trip ${trip.id} names run ${trip.runCode}, which the directory does not publish`);
        const [dep, arr] = runWindow(run.out[0], run.out[1]);
        const [retDep, retArr] = runWindow(run.ret[0], run.ret[1]);
        const insideOutbound = trip.departure >= dep && trip.arrival <= arr;
        const insideReturn = trip.departure >= retDep && trip.arrival <= retArr;
        assert.ok(insideOutbound || insideReturn, `${label(c)} times fall outside the run they claim to come from`);
        traced += 1;
      }
    }
    assert.ok(traced > 10000, `expected thousands of trips to be traced, got ${traced}`);
  });

  it("keeps the stop-by-stop times in travel order and inside the run", () => {
    let checked = 0;
    for (const c of cases) {
      for (const trip of [...c.forward, ...c.reverse]) {
        const shown = trip.fullStops.filter((stop) => stop.minutes !== null);
        for (let k = 1; k < shown.length; k += 1) {
          assert.ok(
            (shown[k].minutes as number) >= (shown[k - 1].minutes as number),
            `${label(c)} stop times go backwards at ${shown[k].name}`,
          );
        }
        const board = trip.fullStops.find((stop) => stop.name === trip.boarding);
        const alight = trip.fullStops.find((stop) => stop.name === trip.alighting);
        assert.equal(board?.minutes, trip.departure, `${label(c)} boarding stop shows a different time`);
        assert.equal(alight?.minutes, trip.arrival, `${label(c)} alighting stop shows a different time`);
        checked += 1;
      }
    }
    assert.ok(checked > 10000, `expected thousands of trips, got ${checked}`);
  });

  it("gives every trip in a search result a unique id", () => {
    // One search mixes every route through the stop; duplicate ids would collide as React keys
    // and as saved-journey links.
    let checked = 0;
    for (const c of cases) {
      const all = findTrips(c.a, c.b);
      const ids = all.map((trip) => trip.id);
      assert.equal(new Set(ids).size, ids.length, `${label(c)}: search result has duplicate ids`);
      checked += 1;
    }
    assert.ok(checked > 5000, `expected many searches, got ${checked}`);
  });
});

describe("Howrah Railway Station <-> Salt Lake Sector V (the reported journey)", () => {
  const from = "Howrah Railway Station";
  const to = "Salt Lake Sector V";
  const forward = findTrips(from, to);
  const reverse = findTrips(to, from);

  it("finds the stops", () => {
    assert.equal(resolveStop(from), from);
    assert.equal(resolveStop(to), to);
  });

  it("shows different times each way for every bus that has a timetable", () => {
    const numbers = new Set(forward.map((t) => t.number));
    assert.ok(numbers.size > 0 && reverse.length > 0);
    for (const number of numbers) {
      const f = forward.filter((t) => t.number === number);
      const r = reverse.filter((t) => t.number === number);
      if (!r.length || f[0].kind === "sample") continue;
      assert.notEqual(timesKey(f), timesKey(r), `${number} shows identical times both ways`);
    }
  });

  it("no longer invents a 06:00 / 06:25 / 06:50 pattern", () => {
    const patterned = new Set(["360-405", "385-430", "410-455"]);
    const hits = [...forward, ...reverse].filter((t) => patterned.has(`${t.departure}-${t.arrival}`));
    assert.equal(hits.length, 0, `still seeing the invented pattern: ${hits.map((h) => h.number).join(", ")}`);
  });

  it("lists buses without a timetable as route links, not as timed trips", () => {
    const timed = new Set([...forward, ...reverse].map((t) => t.number));
    const links = [...findRouteLinks(from, to), ...findRouteLinks(to, from)];
    for (const link of links) assert.ok(!timed.has(link.number), `${link.number} is both timed and a link`);
  });
});

describe("transfers", () => {
  it("only join legs that run the right way, with a safe wait", () => {
    let plans = 0;
    let approximatePlans = 0;
    for (let x = 0; x < STOPS.length; x += 9) {
      for (let y = 1; y < STOPS.length; y += 11) {
        const a = STOPS[x];
        const b = STOPS[y];
        if (a === b || findTrips(a, b).length > 0) continue;
        for (const plan of findTransferPlans(a, b, 0)) {
          plans += 1;
          if (plan.approximate) approximatePlans += 1;
          assert.equal(plan.first.boarding, a);
          assert.equal(plan.first.alighting, plan.transferStop);
          assert.equal(plan.second.boarding, plan.transferStop);
          assert.equal(plan.second.alighting, b);
          assert.notEqual(plan.first.number, plan.second.number);
          const margin = plan.approximate ? 10 : 4;
          assert.ok(plan.second.departure >= plan.first.arrival + margin, `${plan.first.number}>${plan.second.number} wait too short`);
          assert.equal(plan.wait, plan.second.departure - plan.first.arrival);
          assert.equal(plan.approximate, plan.first.kind === "approximate" || plan.second.kind === "approximate");
        }
      }
    }
    assert.ok(plans >= 20, `expected real transfer plans to be exercised, found ${plans}`);
    assert.ok(approximatePlans > 0, "expected some plans built on approximate times");
  });
});

describe("stop search and shortcuts", () => {
  it("every popular journey finds a bus or a route link", () => {
    for (const { from, to } of POPULAR_JOURNEYS) {
      assert.ok(STOPS.includes(canonicalStop(from)), `${from} is not a stop`);
      assert.ok(STOPS.includes(canonicalStop(to)), `${to} is not a stop`);
      assert.ok(findTrips(from, to).length + findRouteLinks(from, to).length > 0, `${from} -> ${to} finds nothing`);
    }
  });

  it("every search alias points at a real stop", () => {
    for (const key of Object.keys(STOP_ALIASES)) {
      assert.ok(STOPS.includes(canonicalStop(key)), `alias "${key}" matches no stop, so its shortcuts never work`);
    }
  });

  it("ranks the stop people mean first", () => {
    assert.equal(searchStops("howrah", 1)[0].name, "Howrah Railway Station");
    assert.equal(searchStops("salt lake", 1)[0].name, "Salt Lake Sector V");
    assert.equal(resolveStop("parnashree"), "Parnasree Pally");
  });
});
