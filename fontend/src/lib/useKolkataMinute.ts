"use client";

import { useSyncExternalStore } from "react";
import { kolkataNowMinutes } from "@/lib/clock";

/*
 * The current minute in Kolkata, as a subscribed value.
 *
 * A timetable page must not read the clock during its first render: the server and the
 * visitor's device disagree, and React reports that as a hydration mismatch. Reading it
 * during render on the client alone would make the pre-rendered HTML and the first
 * client render differ, which is the same problem.
 *
 * `useSyncExternalStore` is the hook built for exactly this: the clock is an external
 * system, the server snapshot is a fixed placeholder, and the browser re-renders with
 * the real minute once it has hydrated. The placeholder is 0, which the caller treats
 * as "not ready yet".
 */

function subscribe(onChange: () => void): () => void {
  // Re-read on the minute boundary by polling. An interval is cheap and, unlike a
  // timer aimed at the next minute, it survives the device being suspended.
  const timer = window.setInterval(onChange, 15_000);
  return () => window.clearInterval(timer);
}

/** Minutes after midnight in Kolkata, or 0 until the browser has hydrated. */
export function useKolkataMinute(): number {
  return useSyncExternalStore(subscribe, kolkataNowMinutes, () => 0);
}
