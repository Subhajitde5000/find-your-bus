import { busesAt, STOP_INDEX, type BusAtStop } from "./stopIndex";
import {
  canonicalStop,
  getRoute,
  getRouteRuns,
  type Direction,
  type ServiceType,
  type TripKind,
} from "./timetables";

/*
 * Every bus that passes one bus stop, and when.
 *
 * This is what the sticker at a bus stop is for: a passenger standing at the stop
 * scans it and wants two things, in this order —
 *
 *   1. which buses are coming next, from now;
 *   2. if none are soon, what passes here at all today.
 *
 * The times are the published passage times at this stop, from the same bundled
 * directory the rest of the site uses. Nothing is live: there is no vehicle tracking,
 * no operator feed, and no estimate dressed up as a timetable. A route that publishes
 * no times still appears, labelled as having none, because "bus 12A stops here" is
 * useful information even without a time.
 *
 * All of it is pure and offline, so the stop page works from a cached copy of the site
 * with no signal at the roadside.
 */

export interface StopPass {
  routeNumber: string;
  routeType: ServiceType;
  operator: string;
  direction: Direction;
  /** The terminus this bus is heading for, which is what a passenger needs to know. */
  towards: string;
  /** Where this bus started, for "comes from" on the row. */
  from: string;
  runCode: string | null;
  bus: string | null;
  /** Minutes on the service timeline, as published (can pass 1440 after midnight). */
  minutes: number;
  /** The same time as a minute of the day, 0..1439, for ordering and printing. */
  clock: number;
  kind: TripKind | null;
}

export interface StopPasses {
  /** The stop's canonical name, or the text given when it is not in the directory. */
  stop: string;
  inDirectory: boolean;
  /** Every pass of the day, earliest in the day first. */
  passes: StopPass[];
  /** Routes that call at the stop, timed or not. */
  routes: BusAtStop[];
  /** How many of those routes publish no passage times at all. */
  untimedRoutes: number;
}

/** Minutes into the day, 0..1439. */
export function minuteOfDay(minutes: number): number {
  return ((Math.round(minutes) % 1440) + 1440) % 1440;
}

/**
 * Results are cached, because a big interchange is expensive to work out and the page
 * asks for it again on every rerender. The cache is small and bounded: a passenger
 * looks at a handful of stops, not at two thousand.
 */
const CACHE_LIMIT = 8;
const cache = new Map<string, StopPasses>();

/**
 * Every published pass at a stop, for the whole day.
 *
 * `stopName` may be an alias ("Howrah Stn"); the directory's own name is resolved
 * first, exactly as journey search does, so a QR printed with either name works.
 *
 * This is a real cost at a hub: Esplanade is served by 261 routes and has some 9,800
 * printed passes in a day, which takes about 150 ms to assemble on a laptop. The page
 * therefore computes it once (here) and shows one hour of it at a time.
 */
export function getStopPasses(stopName: string): StopPasses {
  const key = typeof stopName === "string" ? stopName.trim().toLowerCase() : "";
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const built = buildStopPasses(stopName);
  cache.set(key, built);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return built;
}

function buildStopPasses(stopName: string): StopPasses {
  const asked = typeof stopName === "string" ? stopName.trim().replace(/\s+/g, " ") : "";
  const resolved = canonicalStop(asked) || asked;
  const routes = resolved ? busesAt(STOP_INDEX, resolved) : [];
  const passes: StopPass[] = [];
  const seen = new Set<string>();

  for (const bus of routes) {
    const route = getRoute(bus.number);
    if (!route) continue;
    for (const direction of ["outbound", "return"] as Direction[]) {
      const stops = direction === "outbound" ? route.stops : [...route.stops].reverse();
      const positions: number[] = [];
      stops.forEach((name, index) => {
        if (name === resolved) positions.push(index);
      });
      if (!positions.length) continue;
      const timetable = getRouteRuns(route.number, direction);
      if (!timetable) continue;
      for (const run of timetable.runs) {
        for (const position of positions) {
          const minutes = run.times[position];
          if (minutes === null || minutes === undefined) continue;
          const key = `${route.number}|${direction}|${run.runCode ?? ""}|${position}|${minutes}`;
          if (seen.has(key)) continue;
          seen.add(key);
          passes.push({
            routeNumber: route.number,
            routeType: route.type,
            operator: route.operator,
            direction,
            towards: direction === "outbound" ? route.destination : route.origin,
            from: direction === "outbound" ? route.origin : route.destination,
            runCode: run.runCode,
            bus: run.bus,
            minutes,
            clock: minuteOfDay(minutes),
            kind: timetable.kind,
          });
        }
      }
    }
  }

  passes.sort(
    (a, b) =>
      a.clock - b.clock ||
      a.routeNumber.localeCompare(b.routeNumber, "en", { numeric: true, sensitivity: "base" }) ||
      a.direction.localeCompare(b.direction),
  );

  return {
    stop: resolved || asked,
    inDirectory: routes.length > 0,
    passes,
    routes,
    untimedRoutes: routes.filter((route) => !route.timed).length,
  };
}

export interface UpcomingPass extends StopPass {
  /** Minutes from now until this bus is due. 0 means it is due now. */
  deltaMinutes: number;
  /** True when the bus is after midnight and therefore on tomorrow's calendar day. */
  nextDay: boolean;
}

/**
 * The next buses from a minute of the day, wrapping over midnight.
 *
 * Wrapping matters: at 23:50 the first bus of tomorrow is more useful than an empty
 * list, and a late-evening run that reaches this stop at 00:10 is already in the
 * timetable as 1450 minutes. Both land in the right place here.
 */
export function upcomingPasses(
  passes: StopPass[],
  nowMinutes: number,
  limit = 20,
  options: { horizonMinutes?: number } = {},
): UpcomingPass[] {
  const horizon = options.horizonMinutes ?? 24 * 60;
  const now = minuteOfDay(nowMinutes);
  const out: UpcomingPass[] = [];
  for (const pass of passes) {
    const delta = ((pass.clock - now) % 1440 + 1440) % 1440;
    if (delta > horizon) continue;
    out.push({ ...pass, deltaMinutes: delta, nextDay: now + delta >= 1440 });
  }
  out.sort(
    (a, b) =>
      a.deltaMinutes - b.deltaMinutes ||
      a.routeNumber.localeCompare(b.routeNumber, "en", { numeric: true, sensitivity: "base" }),
  );
  return out.slice(0, limit);
}

/**
 * The whole day grouped by hour, for the "all buses today" view.
 *
 * Hours with no buses are left out rather than drawn empty: this is a timetable a
 * passenger scrolls at a stop, and 24 empty headings would bury the ones that matter.
 */
export function passesByHour(passes: StopPass[]): { hour: number; passes: StopPass[] }[] {
  const groups = new Map<number, StopPass[]>();
  for (const pass of passes) {
    const hour = Math.floor(pass.clock / 60);
    const list = groups.get(hour);
    if (list) list.push(pass);
    else groups.set(hour, [pass]);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hour, list]) => ({ hour, passes: list }));
}

/** "4 min", "1 hr 12 min" — the wait, in the words a passenger uses. */
/**
 * The same wait, squeezed onto a badge: "now", "12m", "4h 21m".
 * A hub at midnight is four hours from the first bus, and "261m" on a tab is unreadable.
 */
export function shortWaitLabel(deltaMinutes: number): string {
  if (deltaMinutes <= 0) return "now";
  if (deltaMinutes < 60) return `${deltaMinutes}m`;
  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function waitLabel(deltaMinutes: number): string {
  if (deltaMinutes <= 0) return "due now";
  if (deltaMinutes < 60) return `in ${deltaMinutes} min`;
  const hours = Math.floor(deltaMinutes / 60);
  const minutes = deltaMinutes % 60;
  if (!minutes) return `in ${hours} hr`;
  return `in ${hours} hr ${minutes} min`;
}
