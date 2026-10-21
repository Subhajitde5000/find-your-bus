import type { DirectionEvidence } from "./ride";

/*
 * The two warnings the ride screen can raise: "get ready, 2 stops left" and "you are
 * going the wrong way". Pure functions, no browser APIs, so every rule is tested.
 *
 * Both only ever use what the screen already knows: the stop the bus has reached, the
 * stop the passenger is getting off at, and the corridor positions of recent GPS fixes.
 * Neither invents a position or a time.
 */

// ------------------------------------------------------------------ stop alert

export type StopAlertLevel = "none" | "soon" | "next" | "arrived" | "missed";

export interface StopAlert {
  level: StopAlertLevel;
  /** Stops still to go, counting the passenger's own stop; 0 once there. */
  stopsLeft: number | null;
  /** Plain-language line for the banner. */
  title: string;
  detail: string;
}

export interface StopAlertInput {
  /** The stop the bus is at, or has just passed. */
  stopIndex: number;
  /** True while the phone is inside that stop's radius. */
  atStop: boolean;
  /** The stop the passenger gets off at. */
  destinationIndex: number;
  destinationName: string;
  /** Metres along the corridor to that stop, or null when it cannot be measured. */
  metresToDestination: number | null;
}

/**
 * Within this distance, "get ready" even if the stop count says more. Distance never makes
 * the alert say "next": that claim is about the stop count, and is only true when one stop is left.
 */
export const SOON_METRES = 700;
/**
 * The ride engine only calls the bus "at" a stop once it has reached the stop's own point,
 * so a bus pulling up a few metres short still reads as "one stop to go". Inside this
 * distance of the passenger's stop that is the same thing as being there.
 */
export const ARRIVED_METRES = 40;
/** "Get ready" at this many stops to go. */
export const SOON_STOPS = 2;

const RANK: Record<StopAlertLevel, number> = { none: 0, soon: 1, next: 2, arrived: 3, missed: 3 };

/** True when a new level is more urgent than the last one that was announced. */
export function isEscalation(previous: StopAlertLevel, next: StopAlertLevel): boolean {
  return RANK[next] > RANK[previous];
}

function stopsWord(count: number): string {
  return `${count} stop${count === 1 ? "" : "s"}`;
}

/**
 * How close the passenger is to getting off.
 *
 * The count is in stops, because that is how a person on a crowded bus thinks about it;
 * the distance can only bring "get ready" forward (stops close together), never later, and
 * never turns it into "your stop is next".
 */
export function stopAlert(input: StopAlertInput | null): StopAlert {
  if (!input) return { level: "none", stopsLeft: null, title: "", detail: "" };
  const { stopIndex, atStop, destinationIndex, destinationName, metresToDestination } = input;

  if (stopIndex === destinationIndex && atStop) {
    return { level: "arrived", stopsLeft: 0, title: `You are at ${destinationName}`, detail: "This is your stop. Time to get off." };
  }
  if (stopIndex >= destinationIndex) {
    return {
      level: "missed",
      stopsLeft: 0,
      title: `You have passed ${destinationName}`,
      detail: "Your stop is behind you. Get off at the next stop and check the way back.",
    };
  }

  const stopsLeft = destinationIndex - stopIndex;
  const metres = metresToDestination;
  if (stopsLeft === 1 && metres !== null && Number.isFinite(metres) && metres <= ARRIVED_METRES) {
    return { level: "arrived", stopsLeft: 0, title: `You are at ${destinationName}`, detail: "This is your stop. Time to get off." };
  }
  let level: StopAlertLevel = "none";
  if (stopsLeft === 1) level = "next";
  else if (stopsLeft <= SOON_STOPS) level = "soon";
  if (metres !== null && Number.isFinite(metres) && metres <= SOON_METRES && level === "none") level = "soon";

  if (level === "next") {
    return {
      level,
      stopsLeft,
      title: "Your stop is next",
      detail: `${destinationName} is the next stop. Move towards the door.`,
    };
  }
  if (level === "soon") {
    return {
      level,
      stopsLeft,
      title: `Get ready: ${stopsWord(stopsLeft)} left`,
      detail: `You get off at ${destinationName}.`,
    };
  }
  return { level: "none", stopsLeft, title: "", detail: "" };
}

/** A short vibration pattern per level, in milliseconds. Empty when nothing should buzz. */
export function vibrationFor(level: StopAlertLevel): number[] {
  switch (level) {
    case "soon":
      return [200];
    case "next":
      return [250, 120, 250];
    case "arrived":
      return [400, 150, 400, 150, 400];
    case "missed":
      return [600, 200, 600];
    default:
      return [];
  }
}

// ------------------------------------------------------------- wrong direction

export type DirectionWarningLevel = "none" | "check" | "wrong";

export interface DirectionWarning {
  level: DirectionWarningLevel;
  /** How far the bus has gone the other way, in metres (positive). */
  metresBackwards: number;
  title: string;
  detail: string;
}

/** Backwards by this much is worth a gentle check. The ride engine's own hint starts at 80 m. */
export const CHECK_BACKWARD_METRES = 80;
/** Backwards by this much is no longer a GPS wobble or a loop in the road. */
export const WRONG_BACKWARD_METRES = 300;

/**
 * Whether the bus is going the other way from the trip the passenger opened.
 *
 * It uses the engine's own direction evidence (corridor positions over the last few
 * minutes), so a bus held at a signal, which produces "unclear", never raises it. A small
 * move backwards is a "check"; a long one is "wrong", and the screen then offers to
 * switch the direction.
 */
export function directionWarning(evidence: DirectionEvidence, origin: string): DirectionWarning {
  if (evidence.hint !== "backward") return { level: "none", metresBackwards: 0, title: "", detail: "" };
  const back = Math.abs(evidence.metres);
  if (back >= WRONG_BACKWARD_METRES) {
    return {
      level: "wrong",
      metresBackwards: back,
      title: "You are going the wrong way",
      detail: `This bus is heading towards ${origin}, not the stop you chose. Get off at the next stop, or switch direction if you meant to ride this way.`,
    };
  }
  if (back >= CHECK_BACKWARD_METRES) {
    return {
      level: "check",
      metresBackwards: back,
      title: "Check your direction",
      detail: `You look like you are travelling towards ${origin}.`,
    };
  }
  return { level: "none", metresBackwards: back, title: "", detail: "" };
}
