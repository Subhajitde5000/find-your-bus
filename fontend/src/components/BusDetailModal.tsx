"use client";

import { useEffect } from "react";
import {
  Accessibility, Armchair, ArrowRight, BusFront, Flag, Info, PersonStanding, Route, Snowflake,
  Sunrise, Sunset, Timer, Users, Wind, X,
} from "lucide-react";
import { formatClock, formatDuration, type BusTrip } from "@/lib/timetables";

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
          <div><span><BusFront size={13} aria-hidden="true" /> Runs every</span><strong>{trip.headway} min</strong></div>
          <div><span><Sunrise size={13} aria-hidden="true" /> First bus</span><strong>{first.time} <em>{first.period}</em></strong></div>
          <div><span><Sunset size={13} aria-hidden="true" /> Last bus</span><strong>{last.time} <em>{last.period}</em></strong></div>
        </div>

        <div className="modal-amenities">
          {trip.type === "AC" ? <span><Snowflake size={13} aria-hidden="true" /> Air conditioned</span> : <span><Wind size={13} aria-hidden="true" /> Open windows</span>}
          <span><Users size={13} aria-hidden="true" /> {trip.operator} service</span>
          <span><Armchair size={13} aria-hidden="true" /> {trip.fullStops.length} stops</span>
          <span><Accessibility size={13} aria-hidden="true" /> Front seats kept free for seniors &amp; wheelchair users</span>
        </div>

        <div className="modal-body">
          <div className="modal-section-heading"><Route size={16} /> All stops on this trip <span>{trip.fullStops.length} stops</span></div>
          <div className="stop-timeline modal-timeline">
            {trip.fullStops.map((stop) => {
              const clock = formatClock(stop.minutes);
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
                  <span className="timeline-time">{clock.time} {clock.period}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="modal-note"><Info size={14} /> Sample schedule for this preview · not a live or official timetable.</div>
      </div>
    </div>
  );
}
