"use client";

import { ArrowDown, Flag, MapPinOff, Navigation2 } from "lucide-react";
import { formatClock } from "@/lib/timetables";
import { corridorCoverage, type RideLeg, type RideRoute } from "@/lib/ride";
import { formatDistance } from "@/lib/geo";

/*
 * The route map for the ride screen.
 *
 * Phase 1 of the offline map: a vertical corridor drawn from the data that is already
 * bundled, with no tile server and therefore nothing to download. A tile map needs a
 * cache of image tiles, which is the heaviest part of making a map work offline, so it
 * comes later; the corridor below answers the same question — where the bus is on its
 * route and what is coming next — with no network at all.
 */

interface ProgressProps {
  ride: RideRoute;
  /** Metres along the corridor, or null before the first match. */
  metresAlong: number | null;
  onBus: boolean;
}

/** The whole corridor as one bar, with the bus marked on it. */
export function RideProgress({ ride, metresAlong, onBus }: ProgressProps) {
  const ratio = ride.totalMetres > 0 && metresAlong !== null ? Math.min(1, Math.max(0, metresAlong / ride.totalMetres)) : 0;
  return (
    <div className="ride-progress" aria-label="Progress along the route">
      <div className="ride-progress-line">
        <span className="ride-progress-fill" style={{ width: `${(ratio * 100).toFixed(1)}%` }} />
        <span
          className={`ride-progress-bus ${onBus ? "on" : ""}`}
          style={{ left: `${(ratio * 100).toFixed(1)}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="ride-progress-labels">
        <span>{ride.origin}</span>
        <strong>{Math.round(ratio * 100)}%</strong>
        <span>{ride.destination}</span>
      </div>
    </div>
  );
}

interface StopListProps {
  ride: RideRoute;
  legs: RideLeg[];
  /** Index of the stop the passenger is at or has just passed, or null. */
  currentStop: number | null;
  onBus: boolean;
}

function legTime(leg: RideLeg): string {
  if (leg.eta === null) return leg.hasPosition ? "—" : "No time";
  const clock = formatClock(leg.eta);
  return `${clock.time} ${clock.period}`;
}

/** The small caption under a time, so a scheduled time is never read as a countdown. */
function legCaption(leg: RideLeg): string | null {
  if (leg.eta === null) return null;
  if (leg.scheduled) return "scheduled";
  if (leg.basis === "estimated") return "estimate from distance";
  return null;
}

/** The corridor stop by stop, with distance and time to each stop ahead. */
export function RideStopList({ ride, legs, currentStop, onBus }: StopListProps) {
  const coverage = corridorCoverage(ride);
  const scheduled = legs.some((leg) => leg.scheduled && leg.eta !== null);
  return (
    <div className="ride-stoplist">
      {scheduled && (
        <p className="ride-list-note">
          Times below are when {ride.runCode ? `run ${ride.runCode}` : "this route"} is scheduled at
          each stop. They become a countdown once your position is matched to the bus.
        </p>
      )}
      {legs.map((leg, index) => {
        const stop = ride.stops[leg.index];
        const role = leg.isDestination
          ? "destination"
          : leg.index === currentStop && onBus
            ? "current"
            : leg.passed
              ? "passed"
              : leg.isNext
                ? "next"
                : "ahead";
        const gap = index > 0 ? legs[index - 1] : null;
        const gapMetres =
          gap && stop.distanceAlongMetres !== null && ride.stops[gap.index].distanceAlongMetres !== null
            ? Math.abs(stop.distanceAlongMetres - (ride.stops[gap.index].distanceAlongMetres ?? 0))
            : null;
        return (
          <div className={`ride-stop ${role}`} key={`${ride.number}-${ride.direction}-${leg.index}`}>
            <div className="ride-stop-rail" aria-hidden="true">
              {index > 0 && <span className={`ride-stop-connector ${leg.passed || role === "current" ? "done" : ""}`} />}
              <span className="ride-stop-dot">
                {role === "current" ? <Navigation2 size={11} strokeWidth={2.6} /> : null}
              </span>
            </div>
            <div className="ride-stop-body">
              {index > 0 && gapMetres !== null && (
                <span className="ride-stop-gap">
                  <ArrowDown size={11} aria-hidden="true" /> {formatDistance(gapMetres)}
                </span>
              )}
              <div className="ride-stop-row">
                <span className="ride-stop-name">
                  {leg.name}
                  {role === "current" && <em>You are here</em>}
                  {role === "next" && <em className="next">Next stop</em>}
                  {role === "destination" && <em className="flag"><Flag size={11} aria-hidden="true" /> Your stop</em>}
                  {!leg.hasPosition && (
                    <em className="unlocated" title="No open source publishes a position for this stop">
                      <MapPinOff size={11} aria-hidden="true" /> no position
                    </em>
                  )}
                </span>
                <span className="ride-stop-figures">
                  {!leg.passed && leg.metresFromHere !== null && (
                    <span className="ride-stop-distance">{formatDistance(leg.metresFromHere)}</span>
                  )}
                  <span className="ride-stop-time">{leg.passed ? "passed" : legTime(leg)}</span>
                </span>
              </div>
              {!leg.passed && legCaption(leg) && <span className="ride-stop-note">{legCaption(leg)}</span>}
              {stop.coordConfidence === "review" && (
                <span className="ride-stop-note">position approximate</span>
              )}
            </div>
          </div>
        );
      })}
      {coverage.located < coverage.total && (
        <p className="ride-coverage">
          {coverage.located} of {coverage.total} stops on this route have a published position, so the
          distances cover the part of the route that is mapped.
        </p>
      )}
    </div>
  );
}
