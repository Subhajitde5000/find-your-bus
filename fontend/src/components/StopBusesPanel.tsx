"use client";

import { useState } from "react";
import Link from "next/link";
import { BusFront, Eye, EyeOff, Navigation2, X } from "lucide-react";
import { busesAt, STOP_INDEX } from "@/lib/stopIndex";

interface Props {
  stopName: string;
  onClose: () => void;
  /** The route currently drawn on the map, if any. */
  shownRoute?: string | null;
  /** Draw (or clear) a route on the map. Omit to hide the button. */
  onShowRoute?: (number: string | null) => void;
  /** Number of the route the passenger is already looking at, listed first and marked. */
  currentRoute?: string;
}

const INITIAL = 10;

/** The buses that stop at one stop. Opens when a stop is tapped on a map. */
export function StopBusesPanel({ stopName, onClose, shownRoute = null, onShowRoute, currentRoute }: Props) {
  const stop = STOP_INDEX.byName.get(stopName);
  const [expanded, setExpanded] = useState(false);
  const all = busesAt(STOP_INDEX, stopName);
  const buses = currentRoute
    ? [...all].sort((a, b) => Number(b.number === currentRoute) - Number(a.number === currentRoute))
    : all;
  const shown = expanded ? buses : buses.slice(0, INITIAL);

  return (
    <section className="stop-buses" aria-label={`Buses that stop at ${stopName}`}>
      <header>
        <div>
          <strong>{stopName}</strong>
          <span>
            {buses.length === 0
              ? "No bus in this directory calls here."
              : `${buses.length} bus${buses.length === 1 ? "" : "es"} stop here`}
            {stop?.position === null ? " · not placed on the map yet" : ""}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close this list">
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      {shown.length > 0 && (
        <ul>
          {shown.map((bus) => {
            const params = new URLSearchParams({ route: bus.number, dir: "outbound", from: stopName });
            const drawn = shownRoute === bus.number;
            return (
              <li key={bus.number} className={bus.number === currentRoute ? "current" : undefined}>
                <span className={`route-square small ${bus.type === "AC" ? "ac" : ""}`}>
                  <BusFront size={15} aria-hidden="true" />
                </span>
                <div className="stop-bus-text">
                  <strong>
                    {bus.number}
                    <span className={`type-badge ${bus.type === "AC" ? "ac" : ""}`}>{bus.type}</span>
                    {bus.timed ? <span className="type-badge timed">Timetable</span> : null}
                  </strong>
                  <span>{bus.origin} to {bus.destination}</span>
                </div>
                <div className="stop-bus-actions">
                  {onShowRoute && (
                    <button
                      type="button"
                      onClick={() => onShowRoute(drawn ? null : bus.number)}
                      aria-pressed={drawn}
                      aria-label={drawn ? `Hide route ${bus.number} on the map` : `Show route ${bus.number} on the map`}
                      title={drawn ? "Hide this route" : "Show this route on the map"}
                    >
                      {drawn ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
                    </button>
                  )}
                  {bus.number !== currentRoute && (
                    <Link href={`/ride?${params.toString()}`} aria-label={`Set on bus ${bus.number}`} title="Set on this bus">
                      <Navigation2 size={14} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {buses.length > INITIAL && (
        <button type="button" className="stop-buses-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Show fewer" : `Show all ${buses.length}`}
        </button>
      )}
    </section>
  );
}
