"use client";

import { useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronLeft, ChevronRight, Flag, MapPinOff, Navigation2, RotateCcw } from "lucide-react";
import { formatClock } from "@/lib/timetables";
import { formatDistance } from "@/lib/geo";
import type { RideLeg, RideRoute } from "@/lib/ride";
import { legAhead, openingStop, stepStop, stopPosition, stopRole, type StopRole } from "@/lib/stopStep";

/*
 * One stop at a time.
 *
 * The full stop list is the right thing for planning a route in advance, and the wrong
 * thing at 40 km/h: seven names in a column, and the one that matters has to be found by
 * reading all of them. This card shows a single stop — the one the passenger is at, or
 * the next one, or the stop they asked for — with the map underneath following along.
 *
 * It is deliberate about what it cannot say: a stop with no published position gets no
 * distance, a stop behind the bus says "passed" instead of a countdown, and a stop with
 * no published time shows no time. The arrows are big, the whole card is keyboard- and
 * swipe-able, and the ends stop rather than wrapping around.
 */

interface Props {
  ride: RideRoute;
  legs: RideLeg[];
  /** Index of the stop the passenger is at or has just left. */
  currentStop: number | null;
  destinationIndex: number;
  nextStopIndex: number | null;
  onBus: boolean;
  /** Passed stops, so a stop behind the bus is shown as history. */
  passed: Set<number>;
  /** The stop on show; null means "work it out". */
  focused: number | null;
  onFocus: (index: number) => void;
  /** Called by the reset button: back to the live position on the route. */
  onReset: () => void;
}

const ROLE_LABEL: Record<StopRole, string> = {
  current: "You are here",
  next: "Next stop",
  destination: "Your stop",
  passed: "Passed",
  ahead: "Ahead",
};

/** A finger that moves less than this is a tap, not a swipe. */
const SWIPE_PX = 42;

export function StopStepper({
  ride,
  legs,
  currentStop,
  destinationIndex,
  nextStopIndex,
  onBus,
  passed,
  focused,
  onFocus,
  onReset,
}: Props) {
  const count = ride.stops.length;
  const context = { currentStop, nextStopIndex, destinationIndex, passed, onBus };
  const live = openingStop(count, context);
  const index = focused !== null && focused >= 0 && focused < count ? focused : live;
  const leg = legs.find((item) => item.index === index);
  const role = stopRole(index, context);
  const ahead = legAhead(leg);
  const dragging = useRef<{ x: number; y: number } | null>(null);

  const move = (delta: number) => {
    const next = stepStop(index, delta, count);
    if (next !== index) onFocus(next);
    // A new stop under the thumb is also the useful place for the keyboard to stay.
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      document.activeElement.focus({ preventScroll: true });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "Home") {
      event.preventDefault();
      onFocus(0);
    } else if (event.key === "End") {
      event.preventDefault();
      onFocus(count - 1);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragging.current;
    dragging.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy)) return;
    move(dx < 0 ? 1 : -1);
  };

  // The dots are a position indicator first and a control second: on a 60-stop route
  // sixty dots are not tappable, so they only appear up to a length a thumb can hit.
  const dots = count <= 24;

  const time = leg?.eta !== null && leg?.eta !== undefined ? formatClock(leg.eta) : null;
  const where = leg
    ? ahead.passed
      ? "behind you"
      : ahead.metres !== null
        ? `${formatDistance(ahead.metres)} ahead`
        : leg.hasPosition
          ? "position not matched yet"
          : "no published position"
    : "";

  return (
    <div className="ob-stepper" data-role={role}>
      <div className="ob-stepper-head">
        <span className="ob-stepper-title">Stops, one at a time</span>
        <span className="ob-stepper-count" aria-hidden="true">
          {stopPosition(index, count)}
        </span>
        {index !== live && (
          <button type="button" className="ob-stepper-reset" onClick={onReset} title="Back to where you are on the route">
            <RotateCcw size={12} aria-hidden="true" /> Back to my bus
          </button>
        )}
      </div>

      <div
        className="ob-stepper-body"
        role="group"
        tabIndex={0}
        aria-label={`Stop ${index + 1} of ${count}: ${leg?.name ?? "—"}. Use the arrow keys to walk the route.`}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (dragging.current = null)}
      >
        <button
          type="button"
          className="ob-stepper-arrow"
          onClick={() => move(-1)}
          disabled={index <= 0}
          aria-label="Previous stop"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>

        <div className="ob-stepper-stop" aria-live="polite">
          <strong className="ob-stepper-name">
            {role === "current" && <Navigation2 size={14} aria-hidden="true" />}
            {role === "destination" && <Flag size={14} aria-hidden="true" />}
            {leg && !leg.hasPosition && <MapPinOff size={14} aria-hidden="true" />}
            {leg?.name ?? "—"}
          </strong>
          <span className="ob-stepper-meta">
            <em className="ob-stepper-role">{ROLE_LABEL[role]}</em>
            <span>{where}</span>
            {time && (
              <span className="ob-stepper-time">
                {time.time} {time.period}
                {leg?.scheduled ? " · scheduled" : ""}
              </span>
            )}
          </span>
        </div>

        <button
          type="button"
          className="ob-stepper-arrow"
          onClick={() => move(1)}
          disabled={index >= count - 1}
          aria-label="Next stop"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>

      {dots && (
        <div className="ob-stepper-dots" role="tablist" aria-label="Stops on this route">
          {ride.stops.map((stop) => {
            const dotRole = stopRole(stop.index, context);
            return (
              <button
                key={`${stop.index}-${stop.name}`}
                type="button"
                role="tab"
                aria-selected={stop.index === index}
                aria-label={`${stop.name}${dotRole === "destination" ? " (your stop)" : ""}`}
                className={`ob-stepper-dot ${stop.index === index ? "on" : ""}`}
                data-role={dotRole}
                onClick={() => onFocus(stop.index)}
              />
            );
          })}
        </div>
      )}

      <p className="ob-stepper-hint">
        Swipe, use ‹ ›, or the arrow keys to walk the route stop by stop. The map follows, and every
        stop is also listed below.
      </p>
    </div>
  );
}
