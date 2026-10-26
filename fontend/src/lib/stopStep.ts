import type { RideLeg } from "@/lib/ride";

/*
 * Walking a route one stop at a time.
 *
 * The ride screens can print every stop at once, which is right for planning but wrong
 * for a passenger standing in a moving bus: seven names in a column, and the one you need
 * has to be found by reading all of them. These helpers answer the two questions the
 * one-by-one view asks — "which stop should I open on?" and "what is the stop before or
 * after this one?" — so the answer is testable without a DOM.
 */

/** What a stop is, from the passenger's point of view, on this journey. */
export type StopRole = "current" | "next" | "destination" | "passed" | "ahead";

export interface StopContext {
  /** Index of the stop the passenger is at or has just left, or null. */
  currentStop: number | null;
  /** Index of the next stop ahead, or null before the bus is matched. */
  nextStopIndex: number | null;
  /** Index of the stop the passenger gets off at. */
  destinationIndex: number;
  /** Indices already behind the bus. */
  passed: Set<number>;
  onBus: boolean;
}

/**
 * The role a stop plays.
 *
 * Order matters: where the passenger is beats everything, then their own stop, then the
 * next one. A destination that has been passed is still their stop — being told "passed"
 * about the place you are getting off is worse than useless.
 */
export function stopRole(index: number, context: StopContext): StopRole {
  if (context.onBus && index === context.currentStop) return "current";
  if (index === context.destinationIndex) return "destination";
  if (context.onBus && index === context.nextStopIndex) return "next";
  if (context.passed.has(index)) return "passed";
  return "ahead";
}

/**
 * Which stop the one-by-one view opens on.
 *
 * The next stop, because that is the one a passenger is about to reach; then where they
 * are; then the first stop of the route, so the view is never empty. Clamped to the route
 * that actually exists.
 */
export function openingStop(
  count: number,
  context: Pick<StopContext, "currentStop" | "nextStopIndex" | "onBus">,
): number {
  if (count <= 0) return 0;
  const candidates = context.onBus
    ? [context.nextStopIndex, context.currentStop]
    : [context.currentStop, context.nextStopIndex];
  for (const candidate of candidates) {
    if (candidate !== null && candidate >= 0 && candidate < count) return candidate;
  }
  return 0;
}

/**
 * Move along the route. The ends stop instead of wrapping: on a bus, a "next" that jumps
 * from the terminus back to the first stop would be a lie about where the bus is going.
 */
export function stepStop(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  const next = index + delta;
  if (next < 0) return 0;
  if (next > count - 1) return count - 1;
  return next;
}

/** "3 of 7", for a counter that never reads as a bare number. */
export function stopPosition(index: number, count: number): string {
  return `${Math.min(Math.max(index + 1, 1), Math.max(count, 1))} of ${count}`;
}

/** How far a stop is from the passenger: the leg already knows, or it does not. */
export function legAhead(leg: RideLeg | undefined): { passed: boolean; metres: number | null; minutes: number | null } {
  if (!leg) return { passed: false, metres: null, minutes: null };
  return {
    passed: Boolean(leg.passed),
    metres: typeof leg.metresFromHere === "number" ? leg.metresFromHere : null,
    minutes: typeof leg.minutesFromHere === "number" ? leg.minutesFromHere : null,
  };
}
