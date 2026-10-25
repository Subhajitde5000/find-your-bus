import { formatClock, type Direction, type RouteRun, type RouteRuns } from "./timetables";
import type { RideRoute, RideStop } from "./ride";

/*
 * Which bus am I sitting in?
 *
 * The sticker on a bus says only which route it is, so the app has to work out the
 * bus from two things it can know: where the passenger is, and what the clock says.
 *
 *   1. The phone's own GPS puts the passenger somewhere along one direction of the
 *      route (`matchRide` in ride.ts already answers "on this corridor, 3.1 km along").
 *   2. The route's published runs say when each scheduled bus is at that point.
 *   3. The run whose time is nearest to now is the bus the passenger is most likely in.
 *
 * Everything here is pure and works on the bundled timetable: no network, no live
 * vehicle positions. The output always carries how far off the match is, because a
 * Kolkata bus is not a train: it can be twenty minutes late, and saying "probably this
 * bus, the timetable says 14:05 and it is 14:19" is honest in a way that pretending to
 * know is not.
 */

/** A run timed at one place: a stop, or a point along the corridor. */
export interface TimedRun {
  runCode: string | null;
  bus: string | null;
  /** Minutes on the run's service timeline at that place, or null when not published. */
  minutes: number | null;
}

export type Confidence = "likely" | "possible" | "unclear";

export interface BusCandidate extends TimedRun {
  /** Scheduled minutes at the place, wrapped into the service day nearest to now. */
  scheduledMinutes: number | null;
  /**
   * Signed minutes between the timetable and the clock: positive means the printed time
   * is later than now (the bus is expected, not yet arrived), negative means it should
   * already have passed.
   */
  offsetMinutes: number | null;
  confidence: Confidence;
}

/**
 * How far from the printed time a bus can be and still be called the likely one.
 *
 * Scaling with the headway is the point: on a route with a bus every 8 minutes a
 * 12-minute error means it is more likely a different bus, while on a route with two
 * buses a day a 12-minute error is nothing. The caps keep both ends sensible.
 */
export function confidenceFor(offsetMinutes: number | null, headway: number | null): Confidence {
  if (offsetMinutes === null) return "unclear";
  const gap = Math.abs(offsetMinutes);
  const likely = Math.min(15, Math.max(6, Math.round((headway ?? 12) * 0.5)));
  const possible = Math.min(45, Math.max(likely + 6, Math.round((headway ?? 20) * 1.5)));
  if (gap <= likely) return "likely";
  if (gap <= possible) return "possible";
  return "unclear";
}

/**
 * The printed time moved onto the service day that is nearest to `nowMinutes`.
 *
 * A run that leaves at 23:40 reaches later stops at 24:05, which is "00:05" on a
 * clock. Comparing that 1445 with a 00:10 clock directly would call it 24 hours away,
 * so each candidate is compared against yesterday's, today's and tomorrow's copy of
 * now, and the nearest wins.
 */
export function offsetAgainstNow(scheduled: number, nowMinutes: number): number {
  const candidates = [scheduled, scheduled + 1440, scheduled - 1440];
  let best = candidates[0] - nowMinutes;
  for (const value of candidates) {
    const diff = value - nowMinutes;
    if (Math.abs(diff) < Math.abs(best)) best = diff;
  }
  return best;
}

/** Minutes into the day, 0..1439. */
export function minuteOfDay(minutes: number): number {
  return ((Math.round(minutes) % 1440) + 1440) % 1440;
}

/**
 * Ranks runs by how close their printed time is to the clock.
 *
 * Runs with no published time at the place are dropped, not guessed: a passenger is
 * better told "no scheduled bus matches" than shown a made-up time.
 */
export function rankRuns(runs: TimedRun[], nowMinutes: number, headway: number | null): BusCandidate[] {
  const candidates: BusCandidate[] = [];
  for (const run of runs) {
    if (run.minutes === null) continue;
    const offset = offsetAgainstNow(run.minutes, nowMinutes);
    candidates.push({
      ...run,
      scheduledMinutes: run.minutes,
      offsetMinutes: offset,
      confidence: confidenceFor(offset, headway),
    });
  }
  return candidates.sort(
    (a, b) => Math.abs(a.offsetMinutes ?? Infinity) - Math.abs(b.offsetMinutes ?? Infinity),
  );
}

/**
 * Each run's printed time at a distance along the corridor.
 *
 * Between two stops with published times, a bus's passage is interpolated by distance.
 * There is no published time at "1.7 km past Garia", but the two printed times around
 * it bracket the answer, and on a moving bus that is worth more than the last stop's
 * time alone. Where either bracket is missing, the nearer single time is used instead.
 */
export function runTimesAtMetres(ride: RideRoute, runs: RouteRun[], metresAlong: number | null): TimedRun[] {
  const timed: TimedRun[] = runs.map((run) => ({ runCode: run.runCode, bus: run.bus, minutes: null }));
  if (metresAlong === null) return timed;

  // The located stops with a time in this run, in travel order.
  const points = ride.stops.map((stop, index) => ({ stop, index }));
  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const times = runs[runIndex].times;
    let before: { metres: number; minutes: number } | null = null;
    let after: { metres: number; minutes: number } | null = null;
    for (const point of points) {
      const metres = point.stop.distanceAlongMetres;
      const minutes = times[point.index];
      if (metres === null || minutes === null || minutes === undefined) continue;
      if (metres <= metresAlong) {
        if (!before || metres >= before.metres) before = { metres, minutes };
      } else if (!after || metres < after.metres) {
        after = { metres, minutes };
      }
    }
    let value: number | null = null;
    if (before && after && after.metres > before.metres) {
      const ratio = (metresAlong - before.metres) / (after.metres - before.metres);
      value = before.minutes + (after.minutes - before.minutes) * Math.min(1, Math.max(0, ratio));
    } else if (before) {
      value = before.minutes;
    } else if (after) {
      value = after.minutes;
    }
    timed[runIndex] = { ...timed[runIndex], minutes: value };
  }
  return timed;
}

/** Each run's printed time at one stop index of the direction. */
export function runTimesAtIndex(runs: RouteRun[], index: number): TimedRun[] {
  return runs.map((run) => ({ runCode: run.runCode, bus: run.bus, minutes: run.times[index] ?? null }));
}

export interface Identification {
  candidates: BusCandidate[];
  /** The best candidate, or null when nothing is published at this place. */
  best: BusCandidate | null;
  /** True when no run is close enough to the clock to be shown as fact. */
  unsure: boolean;
}

export function identifyBus(
  times: TimedRun[],
  nowMinutes: number,
  headway: number | null,
): Identification {
  const candidates = rankRuns(times, nowMinutes, headway);
  const best = candidates[0] ?? null;
  return { candidates, best, unsure: !best || best.confidence === "unclear" };
}

/** "14:05" for a passage time, in the same form the rest of the site prints times. */
export function passageClock(minutes: number | null): string {
  if (minutes === null) return "—";
  const clock = formatClock(minutes);
  return `${clock.time} ${clock.period}`;
}

/**
 * A plain sentence for the identification card.
 *
 * It names the stop the passenger has just passed and the printed time there, so the
 * passenger can check the app against the bus they are in rather than trust it.
 */
export function describeIdentification(
  candidate: BusCandidate | null,
  place: { stopName: string | null; stopMinutes: number | null; nowMinutes: number },
): { title: string; detail: string } {
  const now = passageClock(minuteOfDay(place.nowMinutes));
  if (!candidate || candidate.offsetMinutes === null) {
    return {
      title: "No scheduled bus matches this time",
      detail: `No run of this route publishes a time here. The timetable below is still right, it just cannot say which bus this is. It is ${now} now.`,
    };
  }
  const at = place.stopName
    ? `${place.stopName} at ${passageClock(place.stopMinutes ?? candidate.scheduledMinutes)}`
    : `this point at ${passageClock(candidate.scheduledMinutes)}`;
  const gap = Math.abs(Math.round(candidate.offsetMinutes));
  const direction = candidate.offsetMinutes >= 0 ? "ahead of" : "later than";
  if (candidate.confidence === "likely") {
    return {
      title: "This is the bus you are most likely in",
      detail: `The timetable puts ${at}, and it is ${now} now — ${gap} minute${gap === 1 ? "" : "s"} ${direction} the clock.`,
    };
  }
  if (candidate.confidence === "possible") {
    return {
      title: "Probably this bus",
      detail: `The timetable puts ${at}, and it is ${now} now. Buses drift, so check the bus in front of you; the other buses near now are below.`,
    };
  }
  return {
    title: "No bus matches this time closely",
    detail: `The nearest printed bus is ${gap} minute${gap === 1 ? "" : "s"} off (${at}). It may be late, or this may be an extra bus. The timetable below still applies.`,
  };
}

/** Which run the passenger can switch to by hand, named the way the workbook does. */
export function runLabel(candidate: TimedRun, index: number): string {
  if (candidate.runCode) return `Run ${candidate.runCode}`;
  return candidate.bus ? `Bus ${candidate.bus}` : `Bus ${index + 1}`;
}

/* ------------------------------------------------------------------ direction */

export interface DirectionReading {
  direction: Direction;
  /** null when the phone could not be placed at all. */
  onCorridor: boolean;
  metresOffRoute: number | null;
  /** Metres along the corridor, so a caller can compare where each direction puts us. */
  metresAlong: number | null;
}

/**
 * Picks the direction of travel from one GPS match per direction.
 *
 * A route's two directions are usually the same road, so both corridors can match. The
 * reading that is closer to the road wins; when they are within a bus width of each
 * other the answer is genuinely ambiguous and `ambiguous` says so, so the screen can
 * ask instead of guessing.
 */
export function chooseDirection(
  readings: DirectionReading[],
  toleranceMetres = 15,
): { direction: Direction | null; ambiguous: boolean } {
  const onRoute = readings.filter((reading) => reading.onCorridor);
  if (!onRoute.length) return { direction: null, ambiguous: false };
  const sorted = [...onRoute].sort(
    (a, b) => (a.metresOffRoute ?? Infinity) - (b.metresOffRoute ?? Infinity),
  );
  if (sorted.length === 1) return { direction: sorted[0].direction, ambiguous: false };
  const gap = (sorted[1].metresOffRoute ?? Infinity) - (sorted[0].metresOffRoute ?? Infinity);
  return { direction: sorted[0].direction, ambiguous: gap <= toleranceMetres };
}

/** The stops of a route the passenger can still get off at, in travel order. */
export function stopsAhead(ride: RideRoute, currentIndex: number | null): RideStop[] {
  if (currentIndex === null) return ride.stops.slice(1);
  return ride.stops.filter((stop) => stop.index > currentIndex);
}

/** Runs of the day that have not started yet at `nowMinutes`, for a "later buses" list. */
export function laterRuns(runs: RouteRuns, nowMinutes: number, limit = 4): TimedRun[] {
  return runs.runs
    .filter((run) => run.start !== null && offsetAgainstNow(run.start, nowMinutes) >= -2)
    .slice(0, limit)
    .map((run) => ({ runCode: run.runCode, bus: run.bus, minutes: run.start }));
}
