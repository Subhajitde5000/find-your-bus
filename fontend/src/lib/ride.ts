import {
  canonicalStop,
  getRideTimetable,
  type Direction,
  type RouteSource,
  type ServiceType,
  type TripKind,
} from "./timetables";
import { STOP_COORD_CONFIDENCE, stopPosition, type CoordConfidence } from "./coords";
import { legGeometry } from "./routeGeometry";
import {
  corridorMetres,
  haversineMetres,
  isPlausibleFix,
  projectOntoPolyline,
  slicePolyline,
  type CorridorSegment,
  type GeoFix,
  type Position,
} from "./geo";

/*
 * The offline ride model.
 *
 * "Set on bus" opens a full-page screen that answers three questions with no network
 * at all:
 *
 *   1. Am I actually on this bus?   -- is my position on the route's corridor?
 *   2. How far is the next stop?   -- metres along that corridor.
 *   3. How long to my stop?        -- published passage times where the operator
 *                                     publishes them, otherwise the corridor distance
 *                                     at this route's own average speed.
 *
 * Everything in this file is pure. The browser's Geolocation API is read in the page
 * component, and its fixes are pushed through `advanceTracker`, a reducer, so the
 * smoothing and the on-bus/not-seated decision can be tested without a device.
 *
 * What is deliberately NOT here:
 *   - No live vehicle positions. Nothing is tracked; the passenger's own phone is the
 *     only moving thing this feature knows about.
 *   - No invented coordinates. A stop the data cannot place has `position: null`, is
 *     skipped by the corridor, and the ride screen says so.
 */

/** How close the phone has to be to a stop to count as being at it. */
export const STOP_RADIUS_METRES = 75;
/**
 * How close to the corridor counts as being on the bus.
 *
 * A bus stop is mapped at the shelter, not at the lane the bus drives in, and a phone
 * in a moving bus is easily 20 m from the mapped line. 75 m also covers a bus waiting
 * at a signal just past a stop.
 */
export const CORRIDOR_RADIUS_METRES = 75;

/** City buses average about this in Kolkata traffic; used only when no times exist. */
export const CITY_SPEED_MPS = 18 / 3.6;
/** Long-distance services on the open road, above this corridor length. */
export const EXPRESS_SPEED_MPS = 45 / 3.6;
export const EXPRESS_CORRIDOR_METRES = 40_000;

export interface RideStop {
  index: number;
  name: string;
  /** null when no open source could place this stop; see data/STOP_COORDINATE_AUDIT.md */
  position: Position | null;
  coordConfidence: CoordConfidence | null;
  /** Metres along the corridor from the first located stop, or null when unlocated. */
  distanceAlongMetres: number | null;
  /** Published passage time in minutes, or null when the operator publishes none. */
  minutes: number | null;
}

export interface RideRoute {
  number: string;
  operator: string;
  type: ServiceType;
  category: string | null;
  source: RouteSource;
  direction: Direction;
  /** Terminus this direction starts at. */
  origin: string;
  /** Terminus this direction ends at. */
  destination: string;
  stops: RideStop[];
  /** The measurable parts of the corridor, in travel order. */
  segments: CorridorSegment[];
  /**
   * How many segments follow a bundled road shape. The rest are straight lines, which
   * is the honest fallback for a leg no road network could place -- the map says which.
   */
  roadSegments: number;
  /** Length of the measurable corridor, which is not the whole route when stops are unlocated. */
  totalMetres: number;
  locatedStops: number;
  runCode: string | null;
  bus: string | null;
  /** null when nothing is published for this route. */
  kind: TripKind | null;
  headway: number | null;
  serviceStart: number | null;
  serviceEnd: number | null;
  notes: string | null;
  /** Metres per second used when a leg has no published time. */
  speedMps: number;
  /** "published" when the speed was measured from this route's own timetable. */
  speedBasis: "published" | "default";
  /** How many other runs this direction has today, so the screen can offer another. */
  otherRuns: number;
}

export type RideErrorCode = "route-not-found" | "no-coordinates" | "bad-direction";

export interface RideFailure {
  code: RideErrorCode;
  message: string;
}

export type RideResult = { ok: true; ride: RideRoute } | { ok: false; failure: RideFailure };

export interface RideRequest {
  number: string;
  direction: Direction;
  /** Stop the passenger boarded at, when they opened the screen from a journey. */
  boarding?: string | null;
  /** Stop they mean to get off at; the terminus when they opened it from a route number. */
  alighting?: string | null;
  /** A specific published run, so the times are the ones for that bus. */
  runCode?: string | null;
  /** Minutes after midnight "now" is, so the next run can be picked. */
  atMinute?: number;
}

function defaultSpeedMps(totalMetres: number): number {
  return totalMetres > EXPRESS_CORRIDOR_METRES ? EXPRESS_SPEED_MPS : CITY_SPEED_MPS;
}

/**
 * Builds the corridor for one direction of one route.
 *
 * The corridor follows the road between each pair of located stops, because a bus
 * drives the street and not the straight line: the road is longer, it bends, and the
 * position the passenger's phone reports is on it. Where the bundle has no road shape
 * for a leg -- the intercity stops outside the road export -- the leg falls back to
 * the straight line between the two stops, and `roadSegments` records how often that
 * happened so the map can say so.
 *
 * A route with unlocated stops has a corridor with gaps: distances are measured along
 * what is known and never across a gap, so a missing stop makes the total shorter
 * rather than wrong.
 */
export function buildRide(request: RideRequest): RideResult {
  const number = typeof request.number === "string" ? request.number.trim() : "";
  if (!number) return { ok: false, failure: { code: "route-not-found", message: "No route number was given." } };
  const direction: Direction = request.direction === "return" ? "return" : "outbound";
  const timetable = getRideTimetable(number, direction, request.atMinute, request.runCode);
  if (!timetable) {
    return { ok: false, failure: { code: "route-not-found", message: `Route ${number} is not in this directory.` } };
  }

  const stops: RideStop[] = timetable.stops.map((stop, index) => {
    const position = stopPosition(stop.name);
    return {
      index,
      name: stop.name,
      position,
      coordConfidence: position ? STOP_COORD_CONFIDENCE.get(stop.name) ?? null : null,
      distanceAlongMetres: null,
      minutes: stop.minutes,
    };
  });

  const segments: CorridorSegment[] = [];
  let roadSegments = 0;
  let total = 0;
  let previous: RideStop | null = null;
  for (const stop of stops) {
    if (!stop.position) continue;
    const position = stop.position;
    stop.distanceAlongMetres = total;
    if (previous?.position) {
      const road = legGeometry(previous.name, stop.name);
      if (road) roadSegments += 1;
      const points = road ?? [previous.position, position];
      const metres = corridorMetres(points);
      segments.push({
        fromStop: previous.index,
        toStop: stop.index,
        points,
        metres,
        startMetres: total,
      });
      total += metres;
      stop.distanceAlongMetres = total;
    }
    previous = stop;
  }

  const locatedStops = stops.filter((stop) => stop.position).length;
  if (locatedStops < 2) {
    return {
      ok: false,
      failure: {
        code: "no-coordinates",
        message: `Route ${number} has ${locatedStops} stop${locatedStops === 1 ? "" : "s"} with a known position. At least two are needed to follow it.`,
      },
    };
  }

  const { speedMps, speedBasis } = measureSpeed(stops, total);

  return {
    ok: true,
    ride: {
      number: timetable.number,
      operator: timetable.operator,
      type: timetable.type,
      category: timetable.category,
      source: timetable.source,
      direction,
      origin: timetable.stops[0]?.name ?? "",
      destination: timetable.stops[timetable.stops.length - 1]?.name ?? "",
      stops,
      segments,
      roadSegments,
      totalMetres: total,
      locatedStops,
      runCode: timetable.runCode,
      bus: timetable.bus,
      kind: timetable.kind,
      headway: timetable.headway,
      serviceStart: timetable.serviceStart,
      serviceEnd: timetable.serviceEnd,
      notes: timetable.notes,
      speedMps,
      speedBasis,
      otherRuns: timetable.otherRuns,
    },
  };
}

/**
 * The average speed of this route, measured from its own published times wherever a
 * pair of stops has both a time and a position. Falls back to a city or express
 * default, and says which one it used so the screen can label the estimate.
 */
function measureSpeed(stops: RideStop[], totalMetres: number): { speedMps: number; speedBasis: "published" | "default" } {
  let metres = 0;
  let minutes = 0;
  for (let index = 1; index < stops.length; index += 1) {
    const before = stops[index - 1];
    const after = stops[index];
    if (before.minutes === null || after.minutes === null) continue;
    if (before.distanceAlongMetres === null || after.distanceAlongMetres === null) continue;
    const legMinutes = after.minutes - before.minutes;
    if (legMinutes <= 0) continue;
    metres += after.distanceAlongMetres - before.distanceAlongMetres;
    minutes += legMinutes;
  }
  if (minutes > 0 && metres > 0) {
    return { speedMps: metres / (minutes * 60), speedBasis: "published" };
  }
  return { speedMps: defaultSpeedMps(totalMetres), speedBasis: "default" };
}

/** The index of the stop the passenger means to get off at. */
export function destinationIndex(ride: RideRoute, alighting?: string | null): number {
  const wanted = alighting ? canonicalStop(alighting) : "";
  if (wanted) {
    const found = ride.stops.findIndex((stop) => stop.name === wanted);
    if (found >= 0) return found;
  }
  return ride.stops.length - 1;
}

// --------------------------------------------------------------------- matching

export interface NearestStop {
  index: number;
  name: string;
  metres: number;
}

export interface RideMatch {
  state: "on-bus" | "not-seated";
  /** True when the phone is within the stop radius, rather than between two stops. */
  atStop: boolean;
  /** The stop just passed, or the stop the passenger is at. */
  stopIndex: number;
  /** The next stop ahead, or null at the end of the corridor. */
  nextStopIndex: number | null;
  /** Metres from the phone to that next stop, or null when it cannot be measured. */
  metresToNextStop: number | null;
  /** Metres along the corridor from the route's first located stop. */
  metresAlong: number | null;
  /** How far the phone is from the corridor; 0 means it is on it. */
  metresOffRoute: number | null;
  nearest: NearestStop;
}

export interface MatchOptions {
  stopRadiusMetres?: number;
  corridorRadiusMetres?: number;
  /**
   * Metres along the corridor at the previous match. A road that loops back on itself
   * -- a bridge approach, a one-way system round a block -- has two points equally
   * close to the same phone, and the distance alone cannot say which one the bus is at.
   * The previous reading can, so the tracker passes it in.
   */
  previousMetresAlong?: number | null;
}

/**
 * How much farther from the road a competing point may be and still count as equally
 * close. A phone's own accuracy is several times this, so a candidate inside it is not
 * measurably worse than the nearest one.
 */
export const CONTINUITY_TOLERANCE_METRES = 10;

/**
 * How far a match may fall behind the previous one and still count as the bus standing
 * still or creeping, rather than as the other direction of a road the route retraces.
 */
export const BACKWARD_SLACK_METRES = 5;

/** The nearest located stop to a position, and how far away it is. */
export function nearestStop(ride: RideRoute, position: Position): NearestStop | null {
  let best: NearestStop | null = null;
  for (const stop of ride.stops) {
    if (!stop.position) continue;
    const metres = haversineMetres(stop.position, position);
    if (!best || metres < best.metres) best = { index: stop.index, name: stop.name, metres };
  }
  return best;
}

/**
 * The corridor segment a position is closest to, and how far off the line it is.
 *
 * When `previousMetresAlong` is given, points that are as close to the road as the
 * nearest one are treated as one place, and the one nearest the passenger's previous
 * position wins. Without that, a road passing close to itself would teleport the
 * marker along the route even though the phone never moved.
 */
export function nearestSegment(
  ride: RideRoute,
  position: Position,
  previousMetresAlong: number | null = null,
): { segment: CorridorSegment; offsetMetres: number; alongMetres: number } | null {
  const candidates: { segment: CorridorSegment; offsetMetres: number; alongMetres: number; at: number }[] = [];
  for (const segment of ride.segments) {
    const projection = projectOntoPolyline(segment.points, position);
    if (!projection) continue;
    candidates.push({
      segment,
      offsetMetres: projection.offsetMetres,
      alongMetres: projection.alongMetres,
      at: segment.startMetres + projection.alongMetres,
    });
  }
  if (!candidates.length) return null;

  let nearest = candidates[0];
  for (const candidate of candidates) {
    if (candidate.offsetMetres < nearest.offsetMetres) nearest = candidate;
  }

  let chosen = nearest;
  if (previousMetresAlong !== null) {
    const plausible = candidates.filter(
      (candidate) => candidate.offsetMetres <= nearest.offsetMetres + CONTINUITY_TOLERANCE_METRES,
    );
    // A route that turns round at a terminus and drives back up the same road puts the
    // passenger equally close to the outbound and the return branch, and the distances
    // alone cannot tell them apart. The bus, though, only moves forward: a branch that
    // would take the passenger backwards is the one it has already driven.
    const forward = plausible.filter((candidate) => candidate.at >= previousMetresAlong - BACKWARD_SLACK_METRES);
    const pool = forward.length ? forward : plausible;
    chosen = pool.reduce((best, candidate) =>
      Math.abs(candidate.at - previousMetresAlong) < Math.abs(best.at - previousMetresAlong) ? candidate : best,
    );
  }
  return { segment: chosen.segment, offsetMetres: chosen.offsetMetres, alongMetres: chosen.alongMetres };
}

/** The next stop ahead of a corridor position, in travel order. */
function nextStopAfter(ride: RideRoute, stopIndex: number): RideStop | null {
  for (let index = stopIndex + 1; index < ride.stops.length; index += 1) {
    const stop = ride.stops[index];
    if (stop.position) return stop;
  }
  return null;
}

/**
 * The stop at or before a distance along the corridor -- the one the passenger has
 * reached -- and the next stop ahead.
 */
function stopsAround(ride: RideRoute, metres: number): { stop: RideStop | null; ahead: RideStop | null } {
  let stop: RideStop | null = null;
  for (const candidate of ride.stops) {
    if (candidate.distanceAlongMetres === null) continue;
    if (candidate.distanceAlongMetres <= metres + 0.001) stop = candidate;
  }
  return { stop, ahead: stop ? nextStopAfter(ride, stop.index) : null };
}

/**
 * Everything the screen shows for a known distance along the corridor.
 *
 * `atStop` is true when the passenger is on the stop as well as at its distance along
 * the route: within the stop radius of the mapped shelter, and no more than that
 * radius past the stop's own position. Approaching a stop is "next stop", which is
 * what a passenger reading the screen expects; being at it is "you are here".
 */
function describeMatch(
  ride: RideRoute,
  metres: number,
  offsetMetres: number,
  nearest: NearestStop,
  stopRadiusMetres: number,
): RideMatch {
  const { stop, ahead } = stopsAround(ride, metres);
  const atStop =
    stop !== null &&
    stop.index === nearest.index &&
    nearest.metres <= stopRadiusMetres &&
    metres - (stop.distanceAlongMetres ?? 0) <= stopRadiusMetres;
  return {
    state: "on-bus",
    atStop,
    stopIndex: stop ? stop.index : nearest.index,
    nextStopIndex: ahead ? ahead.index : null,
    metresToNextStop:
      ahead?.distanceAlongMetres !== null && ahead?.distanceAlongMetres !== undefined
        ? Math.max(0, ahead.distanceAlongMetres - metres)
        : null,
    metresAlong: metres,
    metresOffRoute: offsetMetres,
    nearest,
  };
}

/**
 * Matches one position against a route.
 *
 * Two tests, in order:
 *   - within the stop radius of a stop -> on the bus, at that stop;
 *   - otherwise within the corridor radius of the road -> on the bus, between stops;
 *   - otherwise -> not seated.
 *
 * The corridor test is what keeps the answer stable while the bus is moving: a bus
 * spends most of its time between stops, and matching stops alone would flip to "not
 * seated" every few minutes. The road is what the corridor is measured along now, and
 * the stop test stays first because a shelter is often a few metres off the carriageway
 * -- further than that at a few stops the data places loosely.
 */
export function matchRide(ride: RideRoute, position: Position, options: MatchOptions = {}): RideMatch {
  const stopRadius = options.stopRadiusMetres ?? STOP_RADIUS_METRES;
  const corridorRadius = options.corridorRadiusMetres ?? CORRIDOR_RADIUS_METRES;
  const nearest = nearestStop(ride, position);
  if (!nearest) {
    // buildRide rejects routes with fewer than two located stops, so this is unreachable
    // in the app; it keeps the function total for callers that build a ride by hand.
    return {
      state: "not-seated",
      atStop: false,
      stopIndex: 0,
      nextStopIndex: null,
      metresToNextStop: null,
      metresAlong: null,
      metresOffRoute: null,
      nearest: { index: 0, name: ride.stops[0]?.name ?? "", metres: Infinity },
    };
  }

  const stop = ride.stops[nearest.index];
  if (nearest.metres <= stopRadius && stop.distanceAlongMetres !== null) {
    return describeMatch(ride, stop.distanceAlongMetres, nearest.metres, nearest, stopRadius);
  }

  const leg = nearestSegment(ride, position, options.previousMetresAlong ?? null);
  if (leg && leg.offsetMetres <= corridorRadius) {
    return describeMatch(ride, leg.segment.startMetres + leg.alongMetres, leg.offsetMetres, nearest, stopRadius);
  }

  return {
    state: "not-seated",
    atStop: false,
    stopIndex: nearest.index,
    nextStopIndex: null,
    metresToNextStop: null,
    metresAlong: null,
    metresOffRoute: leg ? leg.offsetMetres : null,
    nearest,
  };
}

// --------------------------------------------------------------------- smoothing and state

export const TRACKER_DEFAULTS = {
  /** Fixes kept for the moving average. Five, sampled at most every 700 ms, is ~3.5 s. */
  windowSize: 5,
  /** How many accepted fixes are needed before a match is trusted. */
  minFixesToMatch: 2,
  /** Consecutive on-corridor fixes needed to say the passenger is on the bus. */
  enterReadings: 2,
  /** How long the screen keeps saying "on bus" after the corridor stops matching. */
  leaveGraceMillis: 20_000,
  /** A fix worse than this is not worth smoothing into the average. */
  maxAccuracyMetres: 150,
  /** A jump bigger than this, in a short time, is a bad fix rather than a fast bus. */
  maxJumpMetres: 500,
  /** 216 km/h. No bus in this directory travels faster, so a fix that implies it is wrong. */
  maxSpeedMps: 60,
  /** Two fixes closer together than this add nothing. */
  minSampleGapMillis: 700,
  /** A fix older than this is stale and ignored. */
  staleFixMillis: 90_000,
};

export type TrackerStatus = "waiting" | "on-bus" | "not-seated";

export interface TrackerOptions {
  windowSize?: number;
  minFixesToMatch?: number;
  enterReadings?: number;
  leaveGraceMillis?: number;
  maxAccuracyMetres?: number;
  maxJumpMetres?: number;
  maxSpeedMps?: number;
  minSampleGapMillis?: number;
  staleFixMillis?: number;
  stopRadiusMetres?: number;
  corridorRadiusMetres?: number;
}

export interface ProgressPoint {
  at: number;
  metresAlong: number;
}

/** One fix that landed on the corridor: when it was taken, and where it puts the bus. */
export interface CorridorReading {
  at: number;
  metres: number;
  offsetMetres: number;
}

/**
 * The mean of the window's corridor positions.
 *
 * Now that the readings are distances along one line, averaging them is what averaging
 * positions could never be: safe at a bend, and monotone. If the bus only moves
 * forward, every reading is at least the one before it, and the mean of a trailing
 * window of such readings can only move forward too -- which is what the screen
 * promises, and what a fitted line through the same points does not guarantee.
 */
function smoothedAlong(readings: CorridorReading[]): number | null {
  if (!readings.length) return null;
  let sum = 0;
  for (const reading of readings) sum += reading.metres;
  return sum / readings.length;
}

export interface TrackerState {
  status: TrackerStatus;
  /** The fixes behind the current match, oldest first. */
  fixes: GeoFix[];
  /** Corridor positions of the fixes in the window, oldest first. */
  readingsAlong: CorridorReading[];
  /** Where the window puts the bus: on the road when matched, the newest fix otherwise. */
  smoothed: Position | null;
  match: RideMatch | null;
  /** Every fix offered, good or bad. */
  readings: number;
  accepted: number;
  rejected: number;
  consecutiveOnRoute: number;
  /** Timestamp of the last fix that matched the corridor. */
  lastOnRouteAt: number | null;
  lastFixAt: number | null;
  /** Corridor positions of recent fixes, oldest first, for direction detection. */
  progress: ProgressPoint[];
  /** Plain-language reason for the current status, safe to show to a passenger. */
  notice: string | null;
}

export function initTracker(): TrackerState {
  return {
    status: "waiting",
    fixes: [],
    readingsAlong: [],
    smoothed: null,
    match: null,
    readings: 0,
    accepted: 0,
    rejected: 0,
    consecutiveOnRoute: 0,
    lastOnRouteAt: null,
    lastFixAt: null,
    progress: [],
    notice: "Looking for your position…",
  };
}

/**
 * Adds one fix to the tracker and returns the next state.
 *
 * The reducer never mutates its input, so a page component can keep the previous state
 * and a test can replay a sequence of fixes and assert on every step.
 */
export function advanceTracker(
  state: TrackerState,
  ride: RideRoute,
  fix: GeoFix,
  options: TrackerOptions = {},
): TrackerState {
  const settings = { ...TRACKER_DEFAULTS, ...options };
  const stopRadius = settings.stopRadiusMetres ?? STOP_RADIUS_METRES;
  const corridorRadius = settings.corridorRadiusMetres ?? CORRIDOR_RADIUS_METRES;
  const next: TrackerState = {
    ...state,
    fixes: [...state.fixes],
    progress: [...state.progress],
    readings: state.readings + 1,
  };

  if (!isPlausibleFix(fix)) {
    next.rejected += 1;
    next.notice = "That reading was outside the area this guide covers. Waiting for the next one…";
    return next;
  }
  if (state.lastFixAt !== null && fix.timestamp - state.lastFixAt > settings.staleFixMillis) {
    // A gap this long means the phone stopped reporting and has started again, so the
    // old window describes where the passenger was, not where they are.
    next.rejected += 1;
    return next;
  }
  const lastAccepted = next.fixes[next.fixes.length - 1];
  if (lastAccepted) {
    if (fix.timestamp - lastAccepted.timestamp < settings.minSampleGapMillis) {
      next.rejected += 1;
      return next;
    }
    const jump = haversineMetres(lastAccepted, fix);
    const seconds = Math.max(1, (fix.timestamp - lastAccepted.timestamp) / 1000);
    if (jump > settings.maxJumpMetres && jump / seconds > settings.maxSpeedMps) {
      // The old window and this fix cannot both be right, and averaging two
      // contradictory places puts the passenger somewhere neither is. So the window
      // restarts here instead of dropping the fix: if the new place is the true one the
      // screen recovers in two more readings, and if it was a one-off bad fix the state
      // machine still needs two consistent readings before it believes it.
      next.fixes = [fix];
      next.readingsAlong = [];
      next.accepted += 1;
      next.lastFixAt = fix.timestamp;
      next.consecutiveOnRoute = 0;
      next.smoothed = { lat: fix.lat, lng: fix.lng };
      next.notice = "Your position jumped. Re-establishing where you are…";
      return next;
    }
  }
  if (typeof fix.accuracy === "number" && Number.isFinite(fix.accuracy) && fix.accuracy > settings.maxAccuracyMetres) {
    next.rejected += 1;
    next.notice = `GPS accuracy is about ${Math.round(fix.accuracy)} m. Waiting for a better fix…`;
    return next;
  }

  next.fixes.push(fix);
  if (next.fixes.length > settings.windowSize) next.fixes = next.fixes.slice(-settings.windowSize);
  next.accepted += 1;
  next.lastFixAt = fix.timestamp;

  // The window, not the lifetime count: after a jump the window is short again and a
  // single reading must not be enough to move the passenger back onto the bus.
  if (next.fixes.length < settings.minFixesToMatch) {
    next.smoothed = { lat: fix.lat, lng: fix.lng };
    next.notice = "Getting your position…";
    return next;
  }

  // Read the newest fix onto the corridor before the window is considered, so the
  // window holds distances along the route rather than raw positions off it.
  const radius = Math.max(stopRadius, corridorRadius);
  const newest = next.fixes[next.fixes.length - 1];
  const newestLeg = nearestSegment(ride, newest, state.readingsAlong.at(-1)?.metres ?? null);
  const newestReading =
    newestLeg && newestLeg.offsetMetres <= radius
      ? {
          at: newest.timestamp,
          metres: newestLeg.segment.startMetres + newestLeg.alongMetres,
          offsetMetres: newestLeg.offsetMetres,
        }
      : null;
  next.readingsAlong = newestReading ? [...state.readingsAlong, newestReading] : [...state.readingsAlong];
  const oldestKept = next.fixes[0].timestamp;
  next.readingsAlong = next.readingsAlong
    .filter((reading) => reading.at >= oldestKept)
    .slice(-settings.windowSize);

  // Smoothing is only meaningful while this reading is on the road. A reading that
  // misses the corridor is a drift, and the screen must say so rather than coasting on
  // where the window was a few seconds ago.
  const along = newestReading ? smoothedAlong(next.readingsAlong) : null;
  const nearestNow = nearestStop(ride, newest);
  const match =
    along !== null && nearestNow
      ? describeMatch(
          ride,
          Math.min(ride.totalMetres, Math.max(0, along)),
          newestReading?.offsetMetres ?? 0,
          nearestNow,
          stopRadius,
        )
      : matchRide(ride, newest, {
          stopRadiusMetres: stopRadius,
          corridorRadiusMetres: corridorRadius,
          previousMetresAlong: state.match?.metresAlong ?? null,
        });
  next.match = match;
  next.smoothed = match.metresAlong !== null ? pointAtMetres(ride, match.metresAlong) : { lat: newest.lat, lng: newest.lng };

  if (match.state === "on-bus") {
    next.consecutiveOnRoute += 1;
    next.lastOnRouteAt = fix.timestamp;
    if (match.metresAlong !== null) {
      next.progress.push({ at: fix.timestamp, metresAlong: match.metresAlong });
      if (next.progress.length > 60) next.progress = next.progress.slice(-60);
    }
    next.status = next.consecutiveOnRoute >= settings.enterReadings ? "on-bus" : next.status;
    if (next.status === "on-bus") next.notice = null;
    else next.notice = "Checking this route against your position…";
    return next;
  }

  next.consecutiveOnRoute = 0;
  const withinGrace =
    next.lastOnRouteAt !== null && fix.timestamp - next.lastOnRouteAt <= settings.leaveGraceMillis;
  if (withinGrace) {
    next.status = "on-bus";
    next.notice = "Signal drifted off the route. Holding your position…";
  } else {
    next.status = "not-seated";
    next.notice = `You do not appear to be on this bus. The nearest stop, ${match.nearest.name}, is about ${Math.round(match.nearest.metres)} m away.`;
  }
  return next;
}

// --------------------------------------------------------------------- direction

export type DirectionHint = "forward" | "backward" | "unclear";

export interface DirectionEvidence {
  hint: DirectionHint;
  /** Signed metres along the corridor over the window; negative means backwards. */
  metres: number;
  spanMillis: number;
}

/**
 * Which way the bus is actually going, from the corridor positions collected so far.
 *
 * The direction of the trip the passenger opened is trusted first; this only confirms
 * or contradicts it once the phone has moved far enough to be sure. A bus standing at
 * a traffic light produces "unclear", which must not flip the screen.
 */
export function directionEvidence(
  progress: ProgressPoint[],
  options: { minMetres?: number; maxSpanMillis?: number } = {},
): DirectionEvidence {
  const minMetres = options.minMetres ?? 80;
  const maxSpanMillis = options.maxSpanMillis ?? 180_000;
  if (progress.length < 2) return { hint: "unclear", metres: 0, spanMillis: 0 };
  const latest = progress[progress.length - 1];
  let earliest = progress[0];
  for (const point of progress) {
    if (latest.at - point.at <= maxSpanMillis) {
      earliest = point;
      break;
    }
  }
  const metres = latest.metresAlong - earliest.metresAlong;
  const spanMillis = latest.at - earliest.at;
  if (spanMillis < 10_000 || Math.abs(metres) < minMetres) return { hint: "unclear", metres, spanMillis };
  return { hint: metres > 0 ? "forward" : "backward", metres, spanMillis };
}

// --------------------------------------------------------------------- times and distances

/**
 * A point on the route's time profile: a stop with both a position and a published
 * time. Two of them are enough to interpolate, which is how the screen answers
 * "how long to my stop" in the middle of a leg.
 */
export interface TimeAnchor {
  metresAlong: number;
  minutes: number;
}

export function timeAnchors(ride: RideRoute): TimeAnchor[] {
  const anchors: TimeAnchor[] = [];
  for (const stop of ride.stops) {
    if (stop.minutes === null || stop.distanceAlongMetres === null) continue;
    anchors.push({ metresAlong: stop.distanceAlongMetres, minutes: stop.minutes });
  }
  return anchors.sort((a, b) => a.metresAlong - b.metresAlong);
}

export interface TimeAtResult {
  minutes: number;
  basis: "published" | "estimated";
}

/**
 * What time the bus reaches a point on the corridor.
 *
 * Between two published times it interpolates, which is what the workbook itself
 * implies for the road in between. Outside them, or when nothing is published, it
 * falls back to the route's speed and says so by returning `basis: "estimated"`.
 */
export function timeAt(
  anchors: TimeAnchor[],
  metresAlong: number,
  speedMps: number,
  offsetMinutes = 0,
): TimeAtResult | null {
  if (anchors.length >= 2) {
    if (metresAlong <= anchors[0].metresAlong) {
      const gap = anchors[0].metresAlong - metresAlong;
      return { minutes: anchors[0].minutes - gap / speedMps / 60 + offsetMinutes, basis: "published" };
    }
    for (let index = 1; index < anchors.length; index += 1) {
      const before = anchors[index - 1];
      const after = anchors[index];
      if (metresAlong <= after.metresAlong) {
        const span = after.metresAlong - before.metresAlong;
        const ratio = span === 0 ? 0 : (metresAlong - before.metresAlong) / span;
        return {
          minutes: before.minutes + ratio * (after.minutes - before.minutes) + offsetMinutes,
          basis: "published",
        };
      }
    }
    const last = anchors[anchors.length - 1];
    return { minutes: last.minutes + (metresAlong - last.metresAlong) / speedMps / 60 + offsetMinutes, basis: "published" };
  }
  if (speedMps <= 0) return null;
  return { minutes: metresAlong / speedMps / 60 + offsetMinutes, basis: "estimated" };
}

export interface RideLeg {
  index: number;
  name: string;
  /** Metres from the passenger's position to this stop, or null when it cannot be measured. */
  metresFromHere: number | null;
  /** Minutes from now, or null when neither a time nor a distance is available. */
  minutesFromHere: number | null;
  /** Clock time in minutes after midnight, or null. */
  eta: number | null;
  /**
   * True when `eta` is the time this bus is scheduled at this stop rather than a
   * prediction from the passenger's position. That is the case before they board: the
   * timetable is still the right thing to show, but it must not be dressed up as an
   * arrival estimate for a bus they are not on.
   */
  scheduled: boolean;
  basis: "published" | "estimated" | "none";
  /** The stop the passenger chose to get off at. */
  isDestination: boolean;
  /** The next stop the bus reaches. */
  isNext: boolean;
  /** Already passed, so it is shown as history rather than as a plan. */
  passed: boolean;
  hasPosition: boolean;
}

export interface RideLegOptions {
  /** Minutes after midnight, so ETAs are clock times. */
  nowMinutes: number;
  destinationIndex: number;
  nextStopIndex: number | null;
}

/**
 * Every stop ahead of the passenger, with how far away it is and when the bus gets
 * there.
 *
 * A stop with a published time but no coordinate still gets a time (the timetable
 * answers it). A stop with a coordinate but no published time still gets a distance
 * and an estimate. Only a stop with neither is left blank — the screen shows "—"
 * rather than a guess.
 */
export function rideLegs(ride: RideRoute, match: RideMatch | null, options: RideLegOptions): RideLeg[] {
  const anchors = timeAnchors(ride);
  const here = match?.metresAlong ?? null;
  const hereTime = here === null ? null : timeAt(anchors, here, ride.speedMps);

  return ride.stops.map((stop) => {
    const isDestination = stop.index === options.destinationIndex;
    const isNext = stop.index === options.nextStopIndex;
    // match.stopIndex is the stop just passed, so it is history rather than a plan.
    const passed = match !== null && match.state === "on-bus" && stop.index <= match.stopIndex;

    const metresFromHere =
      here !== null && stop.distanceAlongMetres !== null ? Math.max(0, stop.distanceAlongMetres - here) : null;

    let minutesFromHere: number | null = null;
    let eta: number | null = null;
    let basis: RideLeg["basis"] = "none";
    let scheduled = false;

    if (stop.minutes !== null && hereTime !== null) {
      minutesFromHere = stop.minutes - hereTime.minutes;
      basis = hereTime.basis;
    } else if (metresFromHere !== null && ride.speedMps > 0) {
      minutesFromHere = metresFromHere / ride.speedMps / 60;
      basis = "estimated";
    } else if (stop.minutes !== null) {
      // No position on the bus, so no countdown is possible. The published time of day
      // is still worth showing, and it says outright that it is a scheduled time.
      eta = stop.minutes;
      basis = "published";
      scheduled = true;
    }

    return {
      index: stop.index,
      name: stop.name,
      metresFromHere,
      minutesFromHere: minutesFromHere === null ? null : Math.max(0, minutesFromHere),
      eta: eta ?? (minutesFromHere === null ? null : Math.round(options.nowMinutes + Math.max(0, minutesFromHere))),
      scheduled,
      basis,
      isDestination,
      isNext,
      passed,
      hasPosition: stop.position !== null,
    };
  });
}

export interface RideSummary {
  /** Metres to the destination stop, or null when the corridor cannot reach it. */
  metresToDestination: number | null;
  minutesToDestination: number | null;
  eta: number | null;
  basis: "published" | "estimated" | "none";
  stopsRemaining: number;
  destinationName: string;
  metresTravelled: number | null;
}

/** The headline numbers for the top of the ride screen. */
export function rideSummary(ride: RideRoute, match: RideMatch | null, nowMinutes: number): RideSummary {
  const destination = ride.stops[ride.stops.length - 1];
  const legs = rideLegs(ride, match, {
    nowMinutes,
    destinationIndex: destination ? destination.index : 0,
    nextStopIndex: match?.nextStopIndex ?? null,
  });
  const target = legs[legs.length - 1];
  return {
    metresToDestination: target?.metresFromHere ?? null,
    minutesToDestination: target?.minutesFromHere ?? null,
    eta: target?.eta ?? null,
    basis: target?.basis ?? "none",
    stopsRemaining: match ? Math.max(0, (destination?.index ?? 0) - match.stopIndex) : legs.length,
    destinationName: destination?.name ?? "",
    metresTravelled: match?.metresAlong ?? null,
  };
}

/** Corridor length between two stops, for the stop list. Null across an unlocated gap. */
export function legDistance(ride: RideRoute, fromIndex: number, toIndex: number): number | null {
  const from = ride.stops[fromIndex];
  const to = ride.stops[toIndex];
  if (!from || !to) return null;
  if (from.distanceAlongMetres === null || to.distanceAlongMetres === null) return null;
  return Math.abs(to.distanceAlongMetres - from.distanceAlongMetres);
}

/**
 * How much of the corridor is measurable.
 *
 * Reported so the screen can be honest: "6 of 7 stops located" tells a passenger why
 * the distances are approximate on that route.
 */
export function corridorCoverage(ride: RideRoute): { located: number; total: number; ratio: number } {
  return {
    located: ride.locatedStops,
    total: ride.stops.length,
    ratio: ride.stops.length ? ride.locatedStops / ride.stops.length : 0,
  };
}

/**
 * The corridor from its start up to `metres`, as a polyline ending exactly there.
 *
 * The map draws the travelled part of the route with this, so the line and the bus
 * marker end at the same point. It walks the same segments the matcher uses, which is
 * why the two never disagree about where the passenger is.
 */
export function corridorUpTo(ride: RideRoute, metres: number): Position[] {
  if (!ride.segments.length) return [];
  const clamped = Math.max(0, Math.min(metres, ride.totalMetres));
  const points: Position[] = [ride.segments[0].points[0]];
  for (const segment of ride.segments) {
    const end = segment.startMetres + segment.metres;
    if (clamped >= end) {
      points.push(...segment.points.slice(1));
      continue;
    }
    points.push(...slicePolyline(segment.points, clamped - segment.startMetres).slice(1));
    break;
  }
  return points;
}

/**
 * Where on the ground a distance along the corridor falls.
 *
 * Beyond the last located stop it returns that stop rather than extrapolating: this
 * project never invents a position, and a bus past the end of the mapped corridor is
 * simply drawn at the end of it.
 */
export function pointAtMetres(ride: RideRoute, metres: number): Position | null {
  const points = corridorUpTo(ride, metres);
  return points.length ? points[points.length - 1] : null;
}
