import { getStopPassages, STOPS, canonicalStop, type StopPassage } from "./timetables";
import { busesAt, STOP_INDEX, type BusAtStop, type StopIndex } from "./stopIndex";
import { stopPosition } from "./coords";
import type { Position } from "./geo";

/*
 * "What passes this stop?"
 *
 * The board behind the sticker on a bus shelter. It answers two questions the same way
 * a printed board does, but with a clock: what is coming in the next couple of hours,
 * and what the whole working day looks like when the passenger taps for it.
 *
 * Kolkata's service day does not end at midnight. A bus published at 00:20 belongs to
 * the previous evening's service, so "already gone" and "in 40 minutes" are decided on a
 * day that starts at 03:30 rather than at 00:00. Without that, every late-night board
 * would show the after-midnight buses as eleven hours away or as long gone.
 */

/** Where a service day is treated as starting, in minutes after midnight. */
export const SERVICE_DAY_START_MINUTES = 3 * 60 + 30;

/** Position of a clock time inside the service day (0 just after 03:30). */
export function boardPosition(minutes: number): number {
  const rounded = Math.round(minutes);
  return ((rounded - SERVICE_DAY_START_MINUTES) % 1440 + 1440) % 1440;
}

export interface BoardPassage {
  passage: StopPassage;
  clock: { time: string; period: string };
  /** Minutes until this passage next happens, 0..1439. */
  aheadMinutes: number;
  /** True when this passage's time already went by earlier in the service day. */
  passed: boolean;
  /** True when the published time is after midnight (a late-evening run). */
  afterMidnight: boolean;
  /** True when it is due within the board's "now" window. */
  due: boolean;
}

export interface StopBoard {
  /** The name the directory uses for this stop. */
  stop: string;
  /** True when the requested name is a known stop, even if the spelling was a variant. */
  known: boolean;
  position: Position | null;
  routes: BusAtStop[];
  /** Every passage with a published time, in service-day order. */
  timed: BoardPassage[];
  /** Routes that call here but publish no times at all. */
  untimed: BusAtStop[];
  now: number;
}

function clockOf(minutes: number): { time: string; period: string } {
  const inDay = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const hours = Math.floor(inDay / 60);
  const mins = inDay % 60;
  return {
    time: `${String(hours % 12 || 12).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
    period: hours < 12 ? "AM" : "PM",
  };
}

/**
 * The board for one stop at one minute.
 *
 * A stop the directory does not know still produces a board with no routes, so the page
 * can say "no bus calls here" instead of failing. Routes are read from the bundled stop
 * index, which is the same list the stop map shows.
 */
export function buildStopBoard(
  stopName: string,
  nowMinutes: number,
  index: StopIndex = STOP_INDEX,
): StopBoard {
  const requested = typeof stopName === "string" ? stopName.trim() : "";
  const stop = canonicalStop(requested) || requested;
  const known = stop !== "" && STOPS.includes(stop);
  const routes = known ? busesAt(index, stop) : [];
  const now = ((Math.round(nowMinutes) % 1440) + 1440) % 1440;
  const nowPos = boardPosition(now);

  const timed: BoardPassage[] = known
    ? getStopPassages(stop).map((passage) => {
        const pos = boardPosition(passage.minutes);
        const ahead = ((pos - nowPos) % 1440 + 1440) % 1440;
        return {
          passage,
          clock: clockOf(passage.minutes),
          aheadMinutes: ahead,
          passed: pos < nowPos,
          afterMidnight: Math.round(passage.minutes) % 1440 < SERVICE_DAY_START_MINUTES,
          due: ahead <= 60,
        };
      })
    : [];

  timed.sort(
    (a, b) =>
      boardPosition(a.passage.minutes) - boardPosition(b.passage.minutes) ||
      a.passage.route.localeCompare(b.passage.route, "en", { numeric: true }),
  );

  return {
    stop,
    known,
    position: stopPosition(stop),
    routes,
    timed,
    untimed: routes.filter((route) => !route.timed),
    now,
  };
}

/** Everything due in the next `withinMinutes`, soonest first. Runs already gone are out. */
export function upcomingPassages(board: StopBoard, withinMinutes = 120, limit?: number): BoardPassage[] {
  const upcoming = board.timed
    .filter((item) => !item.passed && item.aheadMinutes <= withinMinutes)
    .sort((a, b) => a.aheadMinutes - b.aheadMinutes || boardPosition(a.passage.minutes) - boardPosition(b.passage.minutes));
  return typeof limit === "number" ? upcoming.slice(0, limit) : upcoming;
}

/**
 * The rest of the service day from now, across midnight included: what somebody
 * standing at the stop can still catch today, plus the late-night runs after 00:00.
 */
export function restOfDay(board: StopBoard): BoardPassage[] {
  return upcomingPassages(board, 1440);
}

/** The whole published day at this stop, first bus to last, already-passed runs included. */
export function wholeDay(board: StopBoard): BoardPassage[] {
  return [...board.timed];
}

/** How many separate routes with times call at the stop. */
export function timedRouteCount(board: StopBoard): number {
  return new Set(board.timed.map((item) => item.passage.route)).size;
}

/**
 * The next pass of each route at this stop, which is what "which bus first?" means.
 * A route with no published times is not included: there is nothing to promise.
 */
export function firstPerRoute(board: StopBoard, withinMinutes = 120): BoardPassage[] {
  const seen = new Set<string>();
  const out: BoardPassage[] = [];
  for (const item of upcomingPassages(board, withinMinutes)) {
    const key = `${item.passage.route}|${item.passage.direction}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** A short "in 4 min / due now" phrase for the board rows. */
export function duePhrase(aheadMinutes: number): string {
  if (aheadMinutes <= 1) return "Due now";
  if (aheadMinutes > 90) return `in ${Math.round(aheadMinutes / 30) / 2} hr`;
  return `in ${aheadMinutes} min`;
}

export interface DayGroup {
  /** route + direction: the same bus, tracked one way. */
  key: string;
  route: string;
  operator: string;
  type: StopPassage["type"];
  direction: StopPassage["direction"];
  /** The terminus it heads to, so two directions of one route read apart. */
  towards: string;
  kind: StopPassage["kind"];
  /** Every pass of this route and direction at the stop, in service-day order. */
  rows: BoardPassage[];
  /** How many of them have already gone. */
  passed: number;
}

/**
 * The whole day, grouped by bus rather than listed as one long column.
 *
 * A busy stop such as Esplanade has thousands of passages a day. A flat list is both
 * unreadable and slow to draw on a phone, while "route 230 towards Garia: 06:10, 06:40,
 * …" is how a printed board reads anyway. Groups stay collapsed until they are opened.
 */
export function groupPassages(rows: BoardPassage[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const row of rows) {
    const { passage } = row;
    const key = `${passage.route}|${passage.direction}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        route: passage.route,
        operator: passage.operator,
        type: passage.type,
        direction: passage.direction,
        towards: passage.destination,
        kind: passage.kind,
        rows: [],
        passed: 0,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    if (row.passed) group.passed += 1;
    // A route with both sample and published runs should say so, not claim a timetable
    // it only partly has.
    if (passage.kind === "sample") group.kind = "sample";
  }
  return [...groups.values()].sort(
    (a, b) => a.route.localeCompare(b.route, "en", { numeric: true }) || a.towards.localeCompare(b.towards),
  );
}
