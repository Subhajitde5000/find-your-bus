/*
 * Regression tests for journey search.
 *
 * The bug these guard against: searching A -> B and B -> A returned the same buses at the same
 * times, because departures were generated from a fixed 06:00, 06:25, ... pattern that ignored the
 * route and the direction.
 *
 * The site now uses the v2 directory, which publishes a passage time at every stop. The rules
 * below hold for EVERY route and EVERY pair of its stops, in both directions, using the real
 * bundled dataset. A middle-stop trip is checked against the exact cell that the workbook prints,
 * so a return to equal-time interpolation would fail the suite.
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
  formatClock,
  parseClock,
  POPULAR_JOURNEYS,
  resolveStop,
  searchStops,
  STOP_ALIASES,
  STOPS,
  type BusTrip,
  type Direction,
} from "@/lib/timetables";

interface RawRun {
  run: string;
  direction: Direction;
  times: (string | null)[];
}
interface RawRoute {
  number: string;
  source: "directory" | "preview" | "catalogue" | "external";
  origin: string;
  destination: string;
  stops: string[];
  runs: RawRun[];
  frequency?: unknown;
}

const routes = dataset.routes as unknown as RawRoute[];
const hasTimes = (route: RawRoute) =>
  route.source === "preview" ? Boolean(route.frequency) : route.runs.length > 0;
/** Only routes with a timetable can produce a trip, so only they are searched pair by pair. */
const timedRoutes = routes.filter(hasTimes);
const timesKey = (trips: BusTrip[]) => trips.map((trip) => `${trip.departure}-${trip.arrival}`).sort().join("|");
const published = (run: RawRun, index: number): number | null => {
  const value = run.times[index];
  return value === null ? null : parseClock(value);
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
for (const route of timedRoutes) {
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
  it("covers the whole v2 dataset", () => {
    assert.equal(routes.length, 650, "75 directory + 8 sample + 566 catalogue + 1 timed external");
    assert.equal(routes.filter((route) => route.source === "directory").length, 75);
    assert.equal(routes.filter((route) => route.source === "preview").length, 8);
    assert.equal(routes.filter((route) => route.source === "catalogue").length, 566);
    assert.equal(routes.filter((route) => route.source === "external").length, 1);
    assert.ok(cases.length > 1700, `expected thousands of stop pairs, got ${cases.length}`);
  });

  it("never produces a made-up trip kind", () => {
    const allowed = new Set(["scheduled", "sample"]);
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
        assert.deepEqual(trip.fullStops.map((stop) => stop.name), c.route.stops, label(c));
      }
      for (const trip of c.reverse) {
        assert.deepEqual(
          trip.fullStops.map((stop) => stop.name),
          [...c.route.stops].reverse(),
          label(c),
        );
      }
      const ids = [...c.forward, ...c.reverse].map((trip) => trip.id);
      assert.equal(new Set(ids).size, ids.length, `${label(c)} has duplicate trip ids`);
    }
  });

  it("uses the exact passage time the workbook prints at the searched stops", () => {
    // This is the heart of the migration: a middle-stop time must be a published cell, not an
    // equal-time split of the terminal times. The run is matched by run code and direction, and
    // every stop on the trip is compared with its published cell.
    let checked = 0;
    for (const c of cases) {
      if (c.route.source !== "directory") continue;
      const sides: { direction: Direction; board: number; alight: number }[] = [
        { direction: "outbound", board: c.i, alight: c.j },
        { direction: "return", board: c.route.stops.length - 1 - c.j, alight: c.route.stops.length - 1 - c.i },
      ];
      for (const side of sides) {
        for (const trip of side.direction === "outbound" ? c.forward : c.reverse) {
          const run = c.route.runs.find((candidate) => candidate.run === trip.runCode);
          assert.ok(run, `${label(c)} trip ${trip.id} names run ${trip.runCode}, which the workbook does not publish`);
          assert.equal(run.direction, side.direction, `${label(c)} ${run.run} is in the wrong direction`);
          const expectedDeparture = published(run, side.board);
          const expectedArrival = published(run, side.alight);
          assert.ok(expectedDeparture !== null, `${label(c)} ${run.run} has a blank boarding time`);
          assert.ok(expectedArrival !== null, `${label(c)} ${run.run} has a blank alighting time`);
          assert.equal(trip.departure % 1440, expectedDeparture % 1440, `${label(c)} ${run.run} departure`);
          assert.equal(trip.arrival % 1440, expectedArrival % 1440, `${label(c)} ${run.run} arrival`);
          assert.equal(trip.fullStops.length, run.times.length, `${label(c)} ${run.run} stop count`);
          for (let index = 0; index < run.times.length; index += 1) {
            const cell = published(run, index);
            const shown = trip.fullStops[index].minutes;
            if (cell === null) {
              assert.equal(shown, null, `${label(c)} ${run.run} stop ${index} should have no time`);
            } else {
              assert.ok(shown !== null, `${label(c)} ${run.run} stop ${index} lost its published time`);
              assert.equal(shown % 1440, cell % 1440, `${label(c)} ${run.run} stop ${index}`);
            }
          }
          checked += 1;
        }
      }
    }
    assert.ok(checked > 20000, `expected every directory trip to be checked, got ${checked}`);
  });

  it("uses the published outbound and return terminal times", () => {
    let checked = 0;
    for (const route of routes.filter((candidate) => candidate.source === "directory")) {
      const last = route.stops.length - 1;
      const forward = findTrips(route.stops[0], route.stops[last]).filter((trip) => trip.number === route.number);
      const reverse = findTrips(route.stops[last], route.stops[0]).filter((trip) => trip.number === route.number);
      const outStarts = route.runs
        .filter((run) => run.direction === "outbound")
        .map((run) => published(run, 0))
        .filter((value): value is number => value !== null)
        .sort((p, q) => p - q);
      const retStarts = route.runs
        .filter((run) => run.direction === "return")
        .map((run) => published(run, 0))
        .filter((value): value is number => value !== null)
        .sort((p, q) => p - q);
      assert.deepEqual(
        forward.map((trip) => trip.departure % 1440).sort((p, q) => p - q),
        outStarts,
        `${route.number} forward departures must be the outbound times`,
      );
      assert.deepEqual(
        reverse.map((trip) => trip.departure % 1440).sort((p, q) => p - q),
        retStarts,
        `${route.number} reverse departures must be the return times`,
      );
      assert.ok(
        forward.every((trip) => trip.kind === "scheduled"),
        route.number,
      );
      checked += 1;
    }
    assert.equal(checked, 75);
  });

  it("never shows the same times in both directions, sample routes included (the original bug)", () => {
    let checked = 0;
    for (const c of cases) {
      if (!c.forward.length || !c.reverse.length) continue;
      checked += 1;
      assert.notEqual(timesKey(c.forward), timesKey(c.reverse), `${label(c)} shows identical times both ways`);
    }
    // Sample routes are the easiest place for this to slip back in: they use an illustrative
    // frequency, not a workbook row. The return is the same sample bus coming back.
    assert.ok(checked > 1700, `expected the direction check to be exercised, got ${checked}`);
  });

  it("can trace every timed trip back to a published run or frequency", () => {
    let traced = 0;
    for (const c of cases) {
      for (const trip of [...c.forward, ...c.reverse]) {
        if (trip.kind === "sample") {
          assert.ok(c.route.frequency, `${label(c)} sample trip on a route with no frequency`);
          traced += 1;
          continue;
        }
        const run = c.route.runs.find((candidate) => candidate.run === trip.runCode);
        assert.ok(run, `${label(c)} trip ${trip.id} names unpublished run ${trip.runCode}`);
        const board = trip.fullStops.findIndex((stop) => stop.name === trip.boarding);
        const alight = trip.fullStops.findIndex((stop) => stop.name === trip.alighting);
        assert.ok(published(run, board) !== null && published(run, alight) !== null, label(c));
        traced += 1;
      }
    }
    assert.ok(traced > 20000, `expected thousands of trips to be traced, got ${traced}`);
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
    assert.ok(checked > 20000, `expected thousands of trips, got ${checked}`);
  });

  it("gives every trip in a search result a unique id", () => {
    // One search mixes every route through the stop; duplicate ids would collide as React keys
    // and as saved-journey links.
    for (const c of cases) {
      const all = findTrips(c.a, c.b);
      const ids = all.map((trip) => trip.id);
      assert.equal(new Set(ids).size, ids.length, `${label(c)}: search result has duplicate ids`);
    }
  });
});

describe("specific v2 routes", () => {
  it("S12 publishes different times at every stop in each direction", () => {
    const route = routes.find((candidate) => candidate.number === "S12");
    assert.ok(route);
    assert.deepEqual(route.stops, [
      "Howrah Railway Station",
      "Sealdah",
      "Kankurgachi",
      "Ultadanga",
      "Karunamoyee",
      "Eco Park",
      "New Town",
    ]);
    const forward = findTrips("Howrah Railway Station", "Karunamoyee").filter((trip) => trip.number === "S12");
    const reverse = findTrips("Karunamoyee", "Howrah Railway Station").filter((trip) => trip.number === "S12");
    const firstOut = forward.find((trip) => trip.runCode === "RUN-S12-OUT-01");
    const firstRet = reverse.find((trip) => trip.runCode === "RUN-S12-RET-01");
    assert.ok(firstOut);
    assert.ok(firstRet);
    // RUN-S12-OUT-01: 05:00 Howrah, 05:12 Sealdah, ..., 05:50 Karunamoyee.
    assert.equal(firstOut.departure, 5 * 60);
    assert.equal(firstOut.arrival, 5 * 60 + 50);
    // RUN-S12-RET-01: 06:35 New Town, 06:47 Eco Park, 07:00 Karunamoyee, ..., 07:50 Howrah.
    // The bus travels the other way, so Karunamoyee is the boarding stop and Howrah the alighting.
    assert.equal(firstRet.departure, 7 * 60);
    assert.equal(firstRet.arrival, 7 * 60 + 50);
    assert.notEqual(timesKey(forward), timesKey(reverse));
  });

  it("C11 is the v2 Howrah - Tollygunge route, not the old Sector V alignment", () => {
    const route = routes.find((candidate) => candidate.number === "C11");
    assert.ok(route);
    assert.deepEqual(route.stops, [
      "Howrah Railway Station",
      "B.B.D. Bagh",
      "Esplanade",
      "Hazra",
      "Rashbehari",
      "Charu Market",
      "Tollygunge",
    ]);
    const trip = findTrips("Howrah Railway Station", "Tollygunge").find((candidate) => candidate.number === "C11");
    assert.ok(trip);
    assert.equal(trip.kind, "scheduled");
  });

  it("keeps overnight runs in order instead of treating midnight as an error", () => {
    const route = routes.find((candidate) => candidate.number === "NS2");
    assert.ok(route);
    assert.deepEqual(
      route.runs
        .filter((run) => run.direction === "outbound")
        .map((run) => (run.times[0] === null ? null : parseClock(run.times[0]))),
      [22 * 60 + 15, 23 * 60 + 15, 15, 75, 135],
      "the workbook publishes 22:15, 23:15, 00:15, 01:15, 02:15",
    );
    const trips = findTrips("Howrah Railway Station", "R.G. Kar Hospital").filter((trip) => trip.number === "NS2");
    // The last run is after midnight on the service timeline; its departure is > 1440 so it sorts
    // after the 23:15 run and its duration stays positive.
    assert.deepEqual(
      trips.map((trip) => trip.departure),
      [22 * 60 + 15, 23 * 60 + 15, 24 * 60 + 15, 25 * 60 + 15, 26 * 60 + 15],
    );
    for (const trip of trips) assert.ok(trip.arrival > trip.departure, "overnight trip must move forward");
    assert.deepEqual(formatClock(24 * 60 + 15), { time: "12:15", period: "AM" });
  });

  it("does not pair the outbound and return rows into a synthetic round trip", () => {
    // Each row is one direction with its own bus and its own passage times. A route with eight
    // outbound rows and eight return rows has sixteen runs, not eight round trips.
    for (const route of routes.filter((candidate) => candidate.source === "directory")) {
      const outbound = route.runs.filter((run) => run.direction === "outbound");
      const returning = route.runs.filter((run) => run.direction === "return");
      assert.ok(outbound.length > 0 && returning.length > 0, route.number);
      assert.equal(outbound.length + returning.length, route.runs.length, route.number);
      for (const run of route.runs) {
        assert.ok(run.run.includes(`-${run.direction === "outbound" ? "OUT" : "RET"}-`), `${run.run} direction`);
      }
    }
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
    const numbers = new Set(forward.map((trip) => trip.number));
    assert.ok(numbers.size > 0 && reverse.length > 0);
    for (const number of numbers) {
      const f = forward.filter((trip) => trip.number === number);
      const r = reverse.filter((trip) => trip.number === number);
      if (!r.length) continue;
      assert.notEqual(timesKey(f), timesKey(r), `${number} shows identical times both ways`);
    }
  });

  it("says Sample when only the sample route covers the pair", () => {
    // The v2 timetable has no Salt Lake Sector V column: 46 of 75 sheets also omit stops that
    // their alignment sentence names. The retained sample S12E is the only route that publishes
    // Sector V today, so every result must be labelled Sample rather than given a made-up time.
    assert.ok(forward.length > 0);
    for (const trip of [...forward, ...reverse]) {
      assert.equal(trip.kind, "sample");
      assert.equal(trip.number, "S12E");
    }
  });

  it("no longer invents a 06:00 / 06:25 / 06:50 pattern", () => {
    const patterned = new Set(["360-405", "385-430", "410-455"]);
    const hits = [...forward, ...reverse].filter((trip) => patterned.has(`${trip.departure}-${trip.arrival}`));
    assert.equal(hits.length, 0, `still seeing the invented pattern: ${hits.map((hit) => hit.number).join(", ")}`);
  });

  it("lists buses without a timetable as route links, not as timed trips", () => {
    const timed = new Set([...forward, ...reverse].map((trip) => trip.number));
    const links = [...findRouteLinks(from, to), ...findRouteLinks(to, from)];
    for (const link of links) assert.ok(!timed.has(link.number), `${link.number} is both timed and a link`);
  });
});

describe("routes added from the extension workbook", () => {
  it("offers a catalogue route as a link when no timetable exists", () => {
    const links = findRouteLinks("Chetla", "Paikpara");
    assert.ok(links.some((link) => link.number === "33"), "route 33 should connect Chetla and Paikpara");
    assert.equal(findTrips("Chetla", "Paikpara").length, 0, "a catalogue route must never invent a departure");
    const link = links.find((candidate) => candidate.number === "33");
    assert.ok(link?.provenance, "the link must say where the route fact came from");
  });

  it("keeps the published stop times of the one externally timed service", () => {
    const route = routes.find((candidate) => candidate.number === "RADHARANI");
    assert.ok(route, "RADHARANI should be in the dataset");
    assert.equal(route.source, "external");
    assert.equal(route.stops.length, 15);
    const last = route.stops.length - 1;
    const forward = findTrips(route.stops[0], route.stops[last]).filter((trip) => trip.number === "RADHARANI");
    const reverse = findTrips(route.stops[last], route.stops[0]).filter((trip) => trip.number === "RADHARANI");
    assert.equal(forward.length, 1);
    assert.equal(reverse.length, 1);
    assert.equal(forward[0].departure, parseClock(route.runs[0].times[0] as string));
    assert.equal(forward[0].arrival, parseClock(route.runs[0].times[last] as string));
    assert.equal(reverse[0].departure, parseClock(route.runs[1].times[0] as string));
    assert.equal(reverse[0].arrival, parseClock(route.runs[1].times[last] as string));
    assert.notEqual(timesKey(forward), timesKey(reverse));
  });
});

describe("transfers", () => {
  it("only join legs that run the right way, with a safe wait", () => {
    let plans = 0;
    let samplePlans = 0;
    for (let x = 0; x < STOPS.length; x += 7) {
      for (let y = 1; y < STOPS.length; y += 9) {
        const a = STOPS[x];
        const b = STOPS[y];
        if (a === b || findTrips(a, b).length > 0) continue;
        for (const plan of findTransferPlans(a, b, 0)) {
          plans += 1;
          if (plan.includesSample) samplePlans += 1;
          assert.equal(plan.first.boarding, a);
          assert.equal(plan.first.alighting, plan.transferStop);
          assert.equal(plan.second.boarding, plan.transferStop);
          assert.equal(plan.second.alighting, b);
          assert.notEqual(plan.first.number, plan.second.number);
          const margin = plan.includesSample ? 10 : 4;
          assert.ok(
            plan.second.departure >= plan.first.arrival + margin,
            `${plan.first.number}>${plan.second.number} wait too short`,
          );
          assert.equal(plan.wait, plan.second.departure - plan.first.arrival);
          assert.equal(plan.includesSample, plan.first.kind !== "scheduled" || plan.second.kind !== "scheduled");
        }
      }
    }
    assert.ok(plans >= 20, `expected real transfer plans to be exercised, found ${plans}`);
    assert.ok(samplePlans > 0, "expected some plans built on sample times");
  });
});

describe("bundled data integrity", () => {
  it("keeps route numbers, run codes and stop names unique", () => {
    const numbers = routes.map((route) => route.number.toLowerCase());
    assert.equal(new Set(numbers).size, numbers.length, "duplicate route number");
    const runs = routes.flatMap((route) => route.runs.map((run) => run.run));
    assert.equal(new Set(runs).size, runs.length, "duplicate run code");
    const names = STOPS.map((name) => name.toLowerCase());
    assert.equal(new Set(names).size, names.length, "duplicate stop name");
  });

  it("keeps the route terminals as the first and last stop of every route", () => {
    for (const route of routes) {
      assert.equal(route.stops[0], route.origin, `${route.number}: first stop is not the origin`);
      assert.equal(route.stops[route.stops.length - 1], route.destination, `${route.number}: last stop is not the destination`);
    }
  });

  it("does not let a catalogue route shadow a timed one", () => {
    for (const route of routes.filter((candidate) => candidate.source === "catalogue")) {
      const sameNumberTimed = timedRoutes.filter((candidate) => candidate.number === route.number);
      assert.equal(sameNumberTimed.length, 0, `${route.number} is both catalogue-only and timed`);
    }
  });

  it("never lists the same stop twice on one route", () => {
    for (const route of routes) {
      assert.equal(new Set(route.stops).size, route.stops.length, `${route.number} repeats a stop`);
    }
  });

  it("keeps every route stop in the stop directory", () => {
    const known = new Set(STOPS);
    for (const route of routes) {
      for (const stop of route.stops) assert.ok(known.has(stop), `${route.number} uses unknown stop ${stop}`);
    }
  });

  it("keeps every run's times aligned with the route's stops", () => {
    for (const route of routes.filter((candidate) => candidate.source === "directory")) {
      assert.ok(route.runs.length > 0, `${route.number} has no runs`);
      for (const run of route.runs) {
        assert.equal(run.times.length, route.stops.length, `${run.run} has the wrong number of times`);
        assert.ok(run.run.startsWith("RUN-"), `${run.run} is not a run code`);
        for (const value of run.times) {
          if (value === null) continue; // blank cells are allowed and stay blank
          assert.match(value, /^\d{2}:\d{2}$/, `${run.run}: ${value} is not a 24-hour clock time`);
          const minutes = parseClock(value);
          assert.ok(minutes >= 0 && minutes < 1440, `${run.run}: ${value} is out of range`);
        }
      }
    }
    for (const route of routes.filter((candidate) => candidate.source === "preview")) {
      assert.ok(route.frequency, `${route.number} sample route has no frequency`);
    }
  });

  it("keeps meta.counts in step with the records", () => {
    const counts = dataset.meta.counts;
    assert.equal(counts.routes, routes.length);
    assert.equal(counts.directoryRoutes, 75);
    assert.equal(counts.sampleRoutes, 8);
    assert.equal(counts.catalogueRoutes, 566);
    assert.equal(counts.externalTimedRoutes, 1);
    assert.equal(counts.stops, STOPS.length);
    assert.equal(counts.routeStops, routes.reduce((sum, route) => sum + route.stops.length, 0));
    assert.equal(counts.runs, routes.reduce((sum, route) => sum + route.runs.length, 0));
    assert.equal(counts.runs, 1058);
  });

  it("keeps catalogue routes as routes only, with provenance and no invented times", () => {
    const catalogue = routes.filter((route) => route.source === "catalogue");
    assert.equal(catalogue.length, 566);
    for (const route of catalogue) {
      assert.equal(route.runs.length, 0, `${route.number} must not carry runs`);
      assert.equal(route.frequency, undefined, `${route.number} must not carry a frequency`);
    }
    const sample = dataset.routes.find((route) => route.source === "catalogue") as unknown as { provenance?: string };
    assert.ok(sample?.provenance, "a catalogue route must record where the route fact came from");
  });

  it("came from the v2 workbook, not the old directory", () => {
    assert.ok(dataset.meta.sources.includes("Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx"));
    assert.ok(!dataset.meta.sources.includes("Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx"));
    assert.equal(dataset.meta.dedupe.skippedSampleRoutes.length, 12);
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
    assert.equal(resolveStop("parnashree"), "Parnasree");
  });

  it("does not throw on missing or malformed input", () => {
    // Old saved journeys and shared links can carry anything; the data layer must stay safe.
    assert.equal(canonicalStop(undefined as unknown as string), "");
    assert.equal(resolveStop(undefined as unknown as string), undefined);
    assert.deepEqual(findTrips(undefined as unknown as string, "Garia"), []);
    assert.deepEqual(findRouteLinks(undefined as unknown as string, "Garia"), []);
    assert.deepEqual(findTransferPlans(undefined as unknown as string, "Garia", 0), []);
  });
});
