import {
  canonicalStop,
  getRideTimetable,
  getRoute,
  getRouteStops,
  getStopPassages,
  type Direction,
  type StopPassage,
} from "./timetables";
import { stopPosition } from "./coords";
import { haversineMetres, type Position } from "./geo";

/*
 * "I am on the bus, which bus is this?"
 *
 * The sticker inside a bus only names the route. This module turns the phone's own
 * position plus the clock into an honest answer:
 *
 *   1. which stop of the route the passenger is nearest to (or null when no position),
 *   2. which published runs pass that stop close to now, ranked, with how late or early
 *      each one would be,
 *   3. how long the rest of the journey takes to a stop the passenger picks.
 *
 * It is not live tracking and never claims to be. A timetable cannot say where a bus
 * is; it can only say which bus *should* be here, and label that as likely. Every
 * number this module returns is either a published passage time or a difference between
 * two of them.
 */

/**
 * Within this distance of a stop, the passenger counts as standing at it. City bus
 * stops are mapped at the shelter and a GPS fix in a bus is easily 30 m out, so this is
 * generous on purpose.
 */
export const AT_STOP_RADIUS_METRES = 200;

/** Beyond this the passenger is clearly not at that stop; the screen says so. */
export const NEAR_STOP_RADIUS_METRES = 600;

/**
 * How late a bus may be and still be the bus the passenger is on. Kolkata traffic does
 * this routinely, and a timetable matched too tightly would insist the passenger is on
 * a bus that left half an hour ago.
 */
export const LATE_WINDOW_MINUTES = 25;

/**
 * How early. A bus can leave a stop a minute or two ahead of its published time, but a
 * bus ten minutes early is a different bus, and saying so is better than pretending.
 */
export const EARLY_WINDOW_MINUTES = 6;

/** The number of ranked candidates the screen offers before "none of these". */
export const MAX_CANDIDATES = 4;

export interface StopGuess {
  name: string;
  /** Distance from the phone to the stop. */
  metres: number;
  /** True when the route serves this stop in the direction being followed. */
  inDirection: boolean;
  /** at-stop: close enough to be standing there; near: the nearest stop around. */
  level: "at-stop" | "near-stop" | "far";
}

/**
 * The stops of one direction of one route, nearest first.
 *
 * Stops the dataset cannot place are left out entirely -- a guessed position would put
 * the passenger at the wrong stop, and the manual picker lists them anyway.
 */
export function guessStops(
  routeNumber: string,
  direction: Direction,
  position: Position,
  options: { maxMetres?: number; limit?: number } = {},
): StopGuess[] {
  const maxMetres = options.maxMetres ?? 3000;
  const limit = options.limit ?? 6;
  const route = getRoute(routeNumber);
  if (!route) return [];
  const inDirection = new Set(getRouteStops(route.number, direction));
  const seen = new Set<string>();
  const found: StopGuess[] = [];
  for (const name of route.stops) {
    if (seen.has(name)) continue;
    seen.add(name);
    const place = stopPosition(name);
    if (!place) continue;
    const metres = haversineMetres(place, position);
    if (metres > maxMetres) continue;
    found.push({
      name,
      metres,
      inDirection: inDirection.has(name),
      level: metres <= AT_STOP_RADIUS_METRES ? "at-stop" : metres <= NEAR_STOP_RADIUS_METRES ? "near-stop" : "far",
    });
  }
  found.sort((a, b) => a.metres - b.metres || a.name.localeCompare(b.name));
  return found.slice(0, limit);
}

/**
 * Where a published passage falls relative to now, on a service day.
 *
 * Runs after midnight are stored past 1440. Comparing a 00:10 passage (1450) with a
 * 23:40 clock (1420) must give "30 minutes ahead", and comparing it with 05:00 (300)
 * must give "five hours ago", not "nineteen hours ahead". Wrapping to a signed offset
 * inside a day does both.
 */
export function offsetFromNow(minutes: number, now: number): number {
  let offset = minutes - now;
  while (offset < -720) offset += 1440;
  while (offset > 720) offset -= 1440;
  return offset;
}

export interface RunCandidate {
  passage: StopPassage;
  /** Positive: the published time has gone by by this many minutes (bus is late). */
  deltaMinutes: number;
  verdict: "on-time" | "late" | "early";
  label: string;
  confidence: "high" | "medium" | "low";
  /** The clock time the run was published to pass this stop. */
  clock: { time: string; period: string };
}

export interface ServiceWindow {
  /** Earliest published passage of the day, in timeline minutes. */
  first: number | null;
  last: number | null;
  count: number;
}

export type IdentificationState = "identified" | "outside-service" | "no-times" | "waiting";

export interface RunIdentification {
  state: IdentificationState;
  now: number;
  /** Ranked best first. */
  candidates: RunCandidate[];
  best: RunCandidate | null;
  /** The next run still to come, when the best guess is behind. */
  next: StopPassage | null;
  service: ServiceWindow;
  message: string;
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

function latePhrase(delta: number): string {
  const rounded = Math.round(Math.abs(delta));
  return `${rounded} min${rounded === 1 ? "" : "s"}`;
}

export function serviceWindow(passages: StopPassage[]): ServiceWindow {
  if (!passages.length) return { first: null, last: null, count: 0 };
  const times = passages.map((passage) => passage.minutes);
  return { first: Math.min(...times), last: Math.max(...times), count: passages.length };
}

/**
 * Ranks the published runs that could be the bus the passenger is on.
 *
 * The ranking prefers a run that should already have left the stop, because that is
 * what lateness looks like; a run in the future has to be closer to now to beat it,
 * since buses leave early far less often than they run late. Ties and near-ties are
 * reported as near-ties: the screen shows the alternatives rather than pretending the
 * middle one is certain.
 */
export function identifyBusRun(passages: StopPassage[], now: number): RunIdentification {
  const service = serviceWindow(passages);
  if (!passages.length) {
    return {
      state: "no-times",
      now,
      candidates: [],
      best: null,
      next: null,
      service,
      message: "No passage time is published for this stop, so the timetable cannot say which bus this is.",
    };
  }

  const scored = passages
    .map((passage) => {
      const offset = offsetFromNow(passage.minutes, now);
      // offset <= 0: the published time is still ahead. Positive `delta` is lateness.
      return { passage, deltaMinutes: -offset };
    })
    .filter(({ deltaMinutes }) => deltaMinutes >= -EARLY_WINDOW_MINUTES && deltaMinutes <= LATE_WINDOW_MINUTES)
    .map(({ passage, deltaMinutes }) => {
      const early = deltaMinutes < -1;
      const onTime = deltaMinutes >= -1 && deltaMinutes <= 2;
      const label = onTime
        ? "On time"
        : early
          ? `About ${latePhrase(deltaMinutes)} early — unusual`
          : `Running about ${latePhrase(deltaMinutes)} late`;
      return {
        passage,
        deltaMinutes,
        verdict: onTime ? ("on-time" as const) : early ? ("early" as const) : ("late" as const),
        label,
        confidence: "low" as RunCandidate["confidence"],
        clock: clockOf(passage.minutes),
      };
    })
    // Lateness cost is its size; earliness is penalised, because it is the rarer case.
    .sort((a, b) => {
      const score = (candidate: typeof a) =>
        candidate.deltaMinutes >= 0 ? candidate.deltaMinutes : Math.abs(candidate.deltaMinutes) + 8;
      return score(a) - score(b) || a.passage.minutes - b.passage.minutes;
    })
    .slice(0, MAX_CANDIDATES);

  // Confidence compares the best guess with the next plausible one, not just its own
  // error: a bus that matches perfectly is still uncertain if another could too.
  const [best, runnerUp] = scored;
  if (best) {
    const gap = runnerUp ? Math.abs(offsetFromNow(runnerUp.passage.minutes, now) - offsetFromNow(best.passage.minutes, now)) : Infinity;
    const error = Math.abs(best.deltaMinutes);
    const confidence: RunCandidate["confidence"] =
      error <= 7 && gap >= 8 ? "high" : error <= 15 && gap >= 4 ? "medium" : "low";
    scored[0] = { ...best, confidence };
    for (let index = 1; index < scored.length; index += 1) {
      scored[index] = { ...scored[index], confidence: "low" };
    }
  }

  const future = passages
    .map((passage) => ({ passage, offset: offsetFromNow(passage.minutes, now) }))
    .filter((item) => item.offset > 0)
    .sort((a, b) => a.offset - b.offset);
  const next = future[0]?.passage ?? null;

  if (!scored.length) {
    const beforeFirst = next !== null && service.first !== null && now < service.first;
    const afterLast =
      service.last !== null &&
      next === null &&
      offsetFromNow(service.last, now) <= 0 &&
      offsetFromNow(service.last, now) >= -1_440;
    return {
      state: "outside-service",
      now,
      candidates: [],
      best: null,
      next,
      service,
      message: beforeFirst
        ? `The first bus on this route passes here at ${clockOf(service.first ?? 0).time} ${clockOf(service.first ?? 0).period}.`
        : afterLast
          ? `The last published bus on this route has already passed this stop today (${clockOf(service.last ?? 0).time} ${clockOf(service.last ?? 0).period}).`
          : "No published run passes this stop close to now.",
    };
  }

  const winner = scored[0];
  const message =
    winner.confidence === "high"
      ? "This is most likely your bus."
      : winner.confidence === "medium"
        ? "This is the closest published run. Check the alternatives if the bus is not it."
        : "Two or more runs are close. Pick the one that matches the time you boarded.";

  return { state: "identified", now, candidates: scored, best: winner, next, service, message };
}

/** The passages of one route and direction at one stop, which is all identification needs. */
export function passagesFor(routeNumber: string, direction: Direction, stopName: string): StopPassage[] {
  const route = getRoute(routeNumber);
  if (!route) return [];
  const stop = canonicalStop(stopName);
  if (!stop) return [];
  return getStopPassages(stop, { route: route.number, direction });
}

/**
 * Minutes from one stop to another on the chosen run, from the published times only.
 * Null when the source has no time for either stop -- never an estimate.
 */
export function travelMinutes(
  routeNumber: string,
  direction: Direction,
  fromStop: string,
  toStop: string,
  runCode: string | null,
): number | null {
  const timetable = getRideTimetable(routeNumber, direction, undefined, runCode);
  if (!timetable) return null;
  const from = canonicalStop(fromStop);
  const to = canonicalStop(toStop);
  const fromIndex = timetable.stops.findIndex((stop) => stop.name === from);
  const toIndex = timetable.stops.findIndex((stop) => stop.name === to);
  if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) return null;
  const start = timetable.stops[fromIndex].minutes;
  const end = timetable.stops[toIndex].minutes;
  if (start === null || end === null) return null;
  const minutes = end - start;
  return minutes > 0 ? minutes : null;
}

/**
 * The stops a passenger could still be going to, after the one they boarded at.
 * Unlocated stops are included: they are real stops even when the map is missing them.
 */
export function stopsAhead(routeNumber: string, direction: Direction, fromStop: string): string[] {
  const stops = getRouteStops(routeNumber, direction);
  const from = canonicalStop(fromStop);
  const index = stops.indexOf(from);
  if (index < 0) return [];
  const ahead: string[] = [];
  const seen = new Set<string>([from]);
  for (const name of stops.slice(index + 1)) {
    if (seen.has(name)) continue;
    seen.add(name);
    ahead.push(name);
  }
  return ahead;
}
