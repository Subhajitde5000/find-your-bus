"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  Accessibility, Armchair, ArrowRight, BusFront, Flag, Info, LocateFixed, PersonStanding, Route,
  Snowflake, Sunrise, Sunset, Timer, Users, Wind, X,
} from "lucide-react";
import { formatClock, formatDuration, type BusTrip, type TripKind } from "@/lib/timetables";
import { isRideable } from "@/lib/coords";

/**
 * The URL of the full-page ride screen for this trip.
 *
 * It carries everything the ride page needs to reproduce the bus the passenger is
 * looking at: the route, the direction it is travelling, the stops they planned, and
 * the run whose published times they are reading. Nothing is passed that the ride page
 * could not rebuild, so the link works when it is shared or opened cold.
 */
export function rideLink(trip: BusTrip): string {
  const params = new URLSearchParams({ route: trip.number, dir: trip.direction });
  if (trip.boarding) params.set("from", trip.boarding);
  if (trip.alighting) params.set("to", trip.alighting);
  if (trip.runCode) params.set("run", trip.runCode);
  return `/ride?${params.toString()}`;
}

function noteFor(trip: BusTrip): string {
  if (trip.source === "external") {
    return "Stop-by-stop times published by the operator or depot. Nothing here is estimated. Times are not live; confirm with the operator before you travel.";
  }
  const notes: Record<TripKind, string> = {
    scheduled:
      "Passage times from the Kolkata bus directory v2. The directory publishes a time at every stop shown here. Times are not live; confirm with the operator before you travel.",
    sample: "Sample frequency for this route. Not an official timetable.",
  };
  return notes[trip.kind];
}

export function BusDetailModal({ trip, onClose }: { trip: BusTrip | null; onClose: () => void }) {
  useEffect(() => {
    if (!trip) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [trip, onClose]);

  if (!trip) return null;

  const departure = formatClock(trip.departure);
  const arrival = formatClock(trip.arrival);
  const first = formatClock(trip.serviceStart);
  const last = formatClock(trip.serviceEnd);
  const gapLabel = trip.kind === "sample" ? "Runs every" : "Typical gap";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-route">
            <span className={`route-square large ${trip.type === "AC" ? "ac" : ""}`}><BusFront size={26} strokeWidth={2} /></span>
            <span className="modal-route-text">
              <span className="modal-title-row">
                <strong id="detail-title">{trip.number}</strong>
                <span className={`type-badge ${trip.type === "AC" ? "ac" : ""}`}>{trip.type}</span>
                <span className="operator-chip">{trip.operator}</span>
              </span>
              <span className="modal-terminus">{trip.terminusFrom}<ArrowRight size={13} />{trip.terminusTo}</span>
            </span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close bus details" autoFocus>
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        <div className="modal-stats">
          <div><span><PersonStanding size={13} aria-hidden="true" /> Departs {trip.boarding}</span><strong>{departure.time} <em>{departure.period}</em></strong></div>
          <div><span><Flag size={13} aria-hidden="true" /> Arrives {trip.alighting}</span><strong>{arrival.time} <em>{arrival.period}</em></strong></div>
          <div><span><Timer size={13} aria-hidden="true" /> Journey time</span><strong>{formatDuration(trip.duration)}</strong></div>
          <div><span><BusFront size={13} aria-hidden="true" /> {gapLabel}</span><strong>{trip.headway ? `${trip.headway} min` : "—"}</strong></div>
          <div><span><Sunrise size={13} aria-hidden="true" /> First bus</span><strong>{first.time} <em>{first.period}</em></strong></div>
          <div><span><Sunset size={13} aria-hidden="true" /> Last bus</span><strong>{last.time} <em>{last.period}</em></strong></div>
        </div>

        <div className="modal-amenities">
          {trip.type === "AC" ? <span><Snowflake size={13} aria-hidden="true" /> Air conditioned</span> : <span><Wind size={13} aria-hidden="true" /> Open windows</span>}
          <span><Users size={13} aria-hidden="true" /> {trip.operator} service</span>
          <span><Armchair size={13} aria-hidden="true" /> {trip.fullStops.length} stops</span>
          {trip.runCode && <span><Route size={13} aria-hidden="true" /> Run {trip.runCode}</span>}
          <span><BusFront size={13} aria-hidden="true" /> {trip.bus ? `Bus ${trip.bus}` : "Bus not recorded"}</span>
          <span><Accessibility size={13} aria-hidden="true" /> Front seats kept free for seniors &amp; wheelchair users</span>
        </div>

        <div className="modal-body">
          <div className="modal-section-heading"><Route size={16} /> All stops on this trip <span>{trip.fullStops.length} stops</span></div>
          <div className="stop-timeline modal-timeline">
            {trip.fullStops.map((stop) => {
              const clock = stop.minutes === null ? null : formatClock(stop.minutes);
              const role = !stop.journey
                ? "other"
                : stop.name === trip.boarding
                  ? "boarding"
                  : stop.name === trip.alighting
                    ? "alighting"
                    : "journey";
              return (
                <div className={`timeline-stop ${role}`} key={`${trip.id}-full-${stop.name}`}>
                  <span className="timeline-dot" />
                  <span className="timeline-name">
                    {stop.name}
                    {role === "boarding" && <em>Board here</em>}
                    {role === "alighting" && <em>Get off here</em>}
                    {role === "journey" && <em className="on-route">On your route</em>}
                  </span>
                  <span className="timeline-time">{clock ? `${clock.time} ${clock.period}` : "No time published"}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-note"><Info size={14} /> {noteFor(trip)}</div>

        {isRideable(trip.fullStops.map((stop) => stop.name)) ? (
          <div className="modal-ride">
            <div className="modal-ride-text">
              <strong><LocateFixed size={15} aria-hidden="true" /> Set on bus</strong>
              <span>
                Follow this route on a full-page map: where you are on it, how far the next stop is,
                and how long to {trip.alighting}. Works with no signal.
              </span>
            </div>
            <Link className="modal-ride-button" href={rideLink(trip)}>
              Open <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="modal-ride disabled">
            <div className="modal-ride-text">
              <strong>Set on bus is not available for this route</strong>
              <span>
                Fewer than two of its stops have a published position, so there is not enough of the
                route to match against. The timetable above still applies.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
