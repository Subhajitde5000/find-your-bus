/*
 * Regression tests for journey search and full directory completeness.
 *
 * The bug these guard against: searching A -> B and B -> A returned the same buses at the same
 * times, because departures were generated from a fixed 06:00, 06:25, ... pattern that ignored the
 * route and the direction.
 *
 * The site now bundles all 651 verified routes (75 original v2 directory routes + 575 verified
 * routes from missing_timtable_rout-v28.xlsx including E10 + 1 external intercity service
 * RADHARANI) across 2,194 unique stops. Every route has scheduled outbound and return runs, and
 * every stop pair in both directions is verified below without holding millions of BusTrip objects
 * live in heap simultaneously.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
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
const timedRoutes = routes.filter(hasTimes);
const timesKey = (trips: BusTrip[]) => trips.map((trip) => `${trip.departure}-${trip.arrival}`).sort().join("|");

const runByCode = new Map<string, RawRun>();
const runMinutes = new Map<RawRun, (number | null)[]>();
for (const route of routes) {
  for (const run of route.runs) {
    runByCode.set(run.run, run);
    runMinutes.set(
      run,
      run.times.map((value) => (value === null ? null : parseClock(value))),
    );
  }
}
const published = (run: RawRun, index: number): number | null => runMinutes.get(run)?.[index] ?? null;

// Single streaming verification across EVERY route and EVERY ordered stop pair (i < j),
// recording aggregate metrics so all 115,000+ stop pairs and 24,777 runs are verified in <6s & <120MB RAM.
interface AuditSummary {
  pairCount: number;
  directionalPairsChecked: number;
  directoryTripsChecked: number;
  tracedTrips: number;
  monotonicRunsChecked: number;
  uniqueSearchPairsChecked: number;
}

const AUDIT: AuditSummary = (() => {
  const allowedKinds = new Set(["scheduled", "sample"]);
  const checkedRouteDirs = new Set<string>();
  const verifiedRunFullStops = new Set<string>();
  const monotonicRuns = new Set<string>();
  const checkedUniqueSearches = new Set<string>();

  let pairCount = 0;
  let directionalPairsChecked = 0;
  let directoryTripsChecked = 0;
  let tracedTrips = 0;

  for (const route of timedRoutes) {
    const n = route.stops.length;
    const last = n - 1;
    for (let i = 0; i < n; i += 1) {
      const a = route.stops[i];
      for (let j = i + 1; j < n; j += 1) {
        const b = route.stops[j];
        pairCount += 1;
        const lbl = `${route.number}: ${a} <-> ${b}`;

        const allFwd = findTrips(a, b);
        const allRev = findTrips(b, a);

        const searchFwdKey = `${a}\u0000${b}`;
        if (!checkedUniqueSearches.has(searchFwdKey)) {
          checkedUniqueSearches.add(searchFwdKey);
          const idsF = allFwd.map((trip) => trip.id);
          assert.equal(new Set(idsF).size, idsF.length, `${lbl}: forward search result has duplicate ids`);
          const idsR = allRev.map((trip) => trip.id);
          assert.equal(new Set(idsR).size, idsR.length, `${lbl}: reverse search result has duplicate ids`);
        }

        const forward = allFwd.filter((trip) => trip.number === route.number);
        const reverse = allRev.filter((trip) => trip.number === route.number);

        // 1. Directional asymmetry check on every stop pair
        if (forward.length && reverse.length) {
          directionalPairsChecked += 1;
          assert.notEqual(timesKey(forward), timesKey(reverse), `${lbl} shows identical times both ways`);
        }

        // 2. Boarding/alighting, terminus order & unique route trip IDs
        for (const trip of forward) {
          assert.ok(allowedKinds.has(trip.kind), `${lbl} has trip kind "${trip.kind}"`);
          assert.equal(trip.boarding, a, lbl);
          assert.equal(trip.alighting, b, lbl);
          assert.equal(trip.terminusFrom, route.stops[0], `${lbl} forward must start at the first stop`);
          assert.equal(trip.terminusTo, route.stops[last], lbl);
        }
        for (const trip of reverse) {
          assert.ok(allowedKinds.has(trip.kind), `${lbl} has trip kind "${trip.kind}"`);
          assert.equal(trip.boarding, b, lbl);
          assert.equal(trip.alighting, a, lbl);
          assert.equal(trip.terminusFrom, route.stops[last], `${lbl} reverse must start at the last stop`);
          assert.equal(trip.terminusTo, route.stops[0], lbl);
        }
        const pairIds = [...forward, ...reverse].map((trip) => trip.id);
        assert.equal(new Set(pairIds).size, pairIds.length, `${lbl} has duplicate trip ids`);

        const fwdKey = `${route.number}:O`;
        if (!checkedRouteDirs.has(fwdKey) && forward.length > 0) {
          checkedRouteDirs.add(fwdKey);
          assert.deepEqual(forward[0].fullStops.map((stop) => stop.name), route.stops, lbl);
        }
        const revKey = `${route.number}:R`;
        if (!checkedRouteDirs.has(revKey) && reverse.length > 0) {
          checkedRouteDirs.add(revKey);
          assert.deepEqual(reverse[0].fullStops.map((stop) => stop.name), [...route.stops].reverse(), lbl);
        }

        // 3. Exact published run passage times, run traceability & monotonicity
        const sides: { direction: Direction; board: number; alight: number; list: BusTrip[] }[] = [
          { direction: "outbound", board: i, alight: j, list: forward },
          { direction: "return", board: last - j, alight: last - i, list: reverse },
        ];
        for (const side of sides) {
          for (const trip of side.list) {
            const run = trip.runCode ? runByCode.get(trip.runCode) : undefined;
            assert.ok(run, `${lbl} trip ${trip.id} names unpublished run ${trip.runCode}`);
            assert.equal(run.direction, side.direction, `${lbl} ${run.run} is in the wrong direction`);
            const expectedDep = published(run, side.board);
            const expectedArr = published(run, side.alight);
            assert.ok(expectedDep !== null, `${lbl} ${run.run} has a blank boarding time`);
            assert.ok(expectedArr !== null, `${lbl} ${run.run} has a blank alighting time`);
            tracedTrips += 1;

            if (route.source === "directory") {
              assert.equal(trip.departure % 1440, expectedDep % 1440, `${lbl} ${run.run} departure`);
              assert.equal(trip.arrival % 1440, expectedArr % 1440, `${lbl} ${run.run} arrival`);
              if (!verifiedRunFullStops.has(run.run)) {
                verifiedRunFullStops.add(run.run);
                assert.equal(trip.fullStops.length, run.times.length, `${lbl} ${run.run} stop count`);
                for (let idx = 0; idx < run.times.length; idx += 1) {
                  const cell = published(run, idx);
                  const shown = trip.fullStops[idx].minutes;
                  if (cell === null) {
                    assert.equal(shown, null, `${lbl} ${run.run} stop ${idx} should have no time`);
                  } else {
                    assert.ok(shown !== null, `${lbl} ${run.run} stop ${idx} lost its published time`);
                    assert.equal(shown % 1440, cell % 1440, `${lbl} ${run.run} stop ${idx}`);
                  }
                }
              }
              directoryTripsChecked += 1;
            }

            if (!monotonicRuns.has(run.run)) {
              monotonicRuns.add(run.run);
              const shown = trip.fullStops.filter((stop) => stop.minutes !== null);
              for (let k = 1; k < shown.length; k += 1) {
                assert.ok(
                  (shown[k].minutes as number) >= (shown[k - 1].minutes as number),
                  `${lbl} stop times go backwards at ${shown[k].name}`,
                );
              }
            }
            assert.equal(trip.fullStops[side.board]?.minutes, trip.departure, `${lbl} boarding stop mismatch`);
            assert.equal(trip.fullStops[side.alight]?.minutes, trip.arrival, `${lbl} alighting stop mismatch`);
          }
        }
      }
    }
  }

  return {
    pairCount,
    directionalPairsChecked,
    directoryTripsChecked,
    tracedTrips,
    monotonicRunsChecked: monotonicRuns.size,
    uniqueSearchPairsChecked: checkedUniqueSearches.size,
  };
})();

describe("a journey and its reverse (every route, every stop pair)", () => {
  it("covers all 651 verified routes across 2,194 unique stops", () => {
    assert.equal(routes.length, 651, "650 directory + 0 sample + 0 catalogue + 1 timed external");
    assert.equal(routes.filter((route) => route.source === "directory").length, 650);
    assert.equal(routes.filter((route) => route.source === "preview").length, 0);
    assert.equal(routes.filter((route) => route.source === "catalogue").length, 0);
    assert.equal(routes.filter((route) => route.source === "external").length, 1);
    assert.ok(AUDIT.pairCount > 100000, `expected >100,000 stop pairs, got ${AUDIT.pairCount}`);
  });

  it("uses the exact passage time the dataset publishes across millions of stop-to-stop trips", () => {
    assert.ok(
      AUDIT.directoryTripsChecked > 1000000,
      `expected >1,000,000 directory trips checked, got ${AUDIT.directoryTripsChecked}`,
    );
  });

  it("uses the published outbound and return terminal times across all 650 directory routes", () => {
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
    assert.equal(checked, 650);
  });

  it("never shows the same times in both directions across any stop pair (the original bug)", () => {
    assert.ok(
      AUDIT.directionalPairsChecked > 100000,
      `expected >100,000 directional pairs checked, got ${AUDIT.directionalPairsChecked}`,
    );
  });

  it("traces every timed trip back to a published run and checks monotonic stop times on all 24,777 runs", () => {
    assert.ok(AUDIT.tracedTrips > 1000000, `expected >1,000,000 trips traced, got ${AUDIT.tracedTrips}`);
    assert.equal(AUDIT.monotonicRunsChecked, 24777);
    assert.ok(AUDIT.uniqueSearchPairsChecked > 50000);
  });
});

describe("specific v2 and v28 routes", () => {
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
    assert.equal(firstOut.departure, 5 * 60);
    assert.equal(firstOut.arrival, 5 * 60 + 50);
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
    assert.deepEqual(
      trips.map((trip) => trip.departure),
      [22 * 60 + 15, 23 * 60 + 15, 24 * 60 + 15, 25 * 60 + 15, 26 * 60 + 15],
    );
    for (const trip of trips) assert.ok(trip.arrival > trip.departure, "overnight trip must move forward");
    assert.deepEqual(formatClock(24 * 60 + 15), { time: "12:15", period: "AM" });
    // An interpolated passage time arrives as a fraction; a clock has no fractions.
    assert.deepEqual(formatClock(610.7), { time: "10:11", period: "AM" });
    assert.deepEqual(formatClock(1439.6), { time: "12:00", period: "AM" });
  });

  it("includes WBTC route E10 (Howrah Railway Station - Jadavpur 8B) with scheduled runs", () => {
    const route = routes.find((candidate) => candidate.number === "E10");
    assert.ok(route, "E10 must be included");
    assert.deepEqual(route.stops, [
      "Howrah Railway Station",
      "Exide",
      "Rashbehari",
      "Dhakuria",
      "Jadavpur 8B",
    ]);
    const forward = findTrips("Howrah Railway Station", "Jadavpur 8B").filter((trip) => trip.number === "E10");
    const reverse = findTrips("Jadavpur 8B", "Howrah Railway Station").filter((trip) => trip.number === "E10");
    assert.ok(forward.length > 0 && reverse.length > 0);
    assert.notEqual(timesKey(forward), timesKey(reverse));
  });

  it("does not pair the outbound and return rows into a synthetic round trip", () => {
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

  it("shows different scheduled times each way for every bus covering the pair", () => {
    const numbers = new Set(forward.map((trip) => trip.number));
    assert.ok(numbers.size > 0 && reverse.length > 0);
    for (const number of numbers) {
      const f = forward.filter((trip) => trip.number === number);
      const r = reverse.filter((trip) => trip.number === number);
      if (!r.length) continue;
      assert.notEqual(timesKey(f), timesKey(r), `${number} shows identical times both ways`);
    }
    for (const trip of [...forward, ...reverse]) {
      assert.equal(trip.kind, "scheduled");
    }
  });

  it("no longer invents a 06:00 / 06:25 / 06:50 pattern", () => {
    const patterned = new Set(["360-405", "385-430", "410-455"]);
    const hits = [...forward, ...reverse].filter((trip) => patterned.has(`${trip.departure}-${trip.arrival}`));
    assert.equal(hits.length, 0, `still seeing the invented pattern: ${hits.map((hit) => hit.number).join(", ")}`);
  });

  it("lists no untimed route links now that all routes carry full timetables", () => {
    const links = [...findRouteLinks(from, to), ...findRouteLinks(to, from)];
    assert.equal(links.length, 0);
  });
});

describe("routes upgraded from missing_timtable_rout-v28.xlsx and external services", () => {
  it("provides full scheduled trips on formerly untimed catalogue routes such as route 33", () => {
    const fwd = findTrips("Chetla", "Paikpara").filter((trip) => trip.number === "33");
    const rev = findTrips("Paikpara", "Chetla").filter((trip) => trip.number === "33");
    assert.ok(fwd.length > 0 && rev.length > 0, "route 33 should now have scheduled runs both ways");
    assert.equal(findRouteLinks("Chetla", "Paikpara").length, 0);
    assert.notEqual(timesKey(fwd), timesKey(rev));
  });

  it("keeps the published stop times of the one externally timed service untouched", () => {
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
    for (let x = 0; x < STOPS.length; x += 29) {
      for (let y = 1; y < STOPS.length; y += 31) {
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
          assert.ok(
            plan.second.departure >= plan.first.arrival + 4,
            `${plan.first.number}>${plan.second.number} wait too short`,
          );
          assert.equal(plan.wait, plan.second.departure - plan.first.arrival);
          assert.equal(plan.includesSample, false);
        }
      }
    }
    assert.ok(plans >= 20, `expected real transfer plans to be exercised, found ${plans}`);
    assert.equal(samplePlans, 0, "all transfer plans now use real scheduled runs");
  });
});

describe("bundled data integrity and conflict audit logs", () => {
  it("keeps route numbers, run codes and stop names 100% unique with zero duplicates", () => {
    const numbers = routes.map((route) => route.number.toLowerCase());
    assert.equal(new Set(numbers).size, numbers.length, "duplicate route number");
    const runs = routes.flatMap((route) => route.runs.map((run) => run.run));
    assert.equal(new Set(runs).size, runs.length, "duplicate run code");
    const names = STOPS.map((name) => name.toLowerCase());
    assert.equal(new Set(names).size, names.length, "duplicate stop name");
    assert.equal(STOPS.length, 2194);
  });

  it("keeps the route terminals as the first and last stop of every route", () => {
    for (const route of routes) {
      assert.equal(route.stops[0], route.origin, `${route.number}: first stop is not the origin`);
      assert.equal(route.stops[route.stops.length - 1], route.destination, `${route.number}: last stop is not the destination`);
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
          if (value === null) continue;
          assert.match(value, /^\d{2}:\d{2}$/, `${run.run}: ${value} is not a 24-hour clock time`);
          const minutes = parseClock(value);
          assert.ok(minutes >= 0 && minutes < 1440, `${run.run}: ${value} is out of range`);
        }
      }
    }
  });

  it("keeps meta.counts in step with the records", () => {
    const counts = dataset.meta.counts;
    assert.equal(counts.routes, routes.length);
    assert.equal(counts.routes, 651);
    assert.equal(counts.directoryRoutes, 650);
    assert.equal(counts.sampleRoutes, 0);
    assert.equal(counts.catalogueRoutes, 0);
    assert.equal(counts.externalTimedRoutes, 1);
    assert.equal(counts.stops, STOPS.length);
    assert.equal(counts.routeStops, routes.reduce((sum, route) => sum + route.stops.length, 0));
    assert.equal(counts.runs, routes.reduce((sum, route) => sum + route.runs.length, 0));
    assert.equal(counts.runs, 24777);
  });

  it("records all workbook & CSV sources and maintains root conflict audit CSV logs", () => {
    assert.ok(dataset.meta.sources.includes("Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx"));
    assert.ok(dataset.meta.sources.includes("missing_timtable_rout-v28.xlsx"));
    assert.ok(dataset.meta.sources.includes("stop_name_loactio-v8.csv"));
    assert.ok(!dataset.meta.sources.includes("Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx"));
    assert.equal(dataset.meta.dedupe.skippedSampleRoutes.length, 20);

    const repoRoot = path.resolve(process.cwd(), "..");
    const routeAudit = fs.readFileSync(path.join(repoRoot, "change_route_timing.csv"), "utf8").trim().split(/\r?\n/);
    const stopAudit = fs.readFileSync(path.join(repoRoot, "change_stop_location.csv"), "utf8").trim().split(/\r?\n/);
    assert.equal(routeAudit[0], "route_number,v28_sheet,conflict_type,old_value,new_value,reason");
    assert.equal(
      stopAudit[0],
      "stop_name,csv_row,conflict_type,old_lat,old_lng,new_lat,new_lng,confidence,source,reason",
    );
    assert.ok(routeAudit.length > 600, `expected >600 route conflict audit rows, got ${routeAudit.length}`);
    assert.ok(stopAudit.length > 600, `expected >600 stop conflict audit rows, got ${stopAudit.length}`);
  });
});

describe("stop search and shortcuts", () => {
  it("every popular journey finds scheduled buses", () => {
    for (const { from, to } of POPULAR_JOURNEYS) {
      assert.ok(STOPS.includes(canonicalStop(from)), `${from} is not a stop`);
      assert.ok(STOPS.includes(canonicalStop(to)), `${to} is not a stop`);
      assert.ok(findTrips(from, to).length > 0, `${from} -> ${to} finds nothing`);
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
    assert.equal(canonicalStop(undefined as unknown as string), "");
    assert.equal(resolveStop(undefined as unknown as string), undefined);
    assert.deepEqual(findTrips(undefined as unknown as string, "Garia"), []);
    assert.deepEqual(findRouteLinks(undefined as unknown as string, "Garia"), []);
    assert.deepEqual(findTransferPlans(undefined as unknown as string, "Garia", 0), []);
  });
});
