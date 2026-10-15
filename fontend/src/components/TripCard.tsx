import { BusFront, Clock3, CornerDownRight, ArrowUpRight } from "lucide-react";
import { formatClock, formatDuration, type BusTrip, type TripKind } from "@/lib/timetables";

const KIND_LABEL: Record<TripKind, string> = {
  scheduled: "Scheduled",
  sample: "Sample",
  estimated: "Estimated",
};

export function TripCard({ trip, onOpen, firstUpcoming }: {
  trip: BusTrip;
  onOpen: () => void;
  firstUpcoming: boolean;
}) {
  const departure = formatClock(trip.departure);
  const arrival = formatClock(trip.arrival);
  const via = trip.via.length
    ? `${trip.via.slice(0, 3).join(" · ")}${trip.via.length > 3 ? ` · +${trip.via.length - 3} more` : ""}`
    : "Direct journey";

  return (
    <article className="trip-card">
      <button
        type="button"
        className="trip-main"
        onClick={onOpen}
        aria-label={`Bus ${trip.number}, ${trip.type}, ${departure.time} ${departure.period} from ${trip.boarding} to ${trip.alighting}. Open all details and stops.`}
      >
        <span className="trip-identity">
          <span className={`route-square ${trip.type === "AC" ? "ac" : ""}`}><BusFront size={22} strokeWidth={2} /></span>
          <span className="trip-identity-text">
            <span className="route-heading"><strong>{trip.number}</strong><span className={`type-badge ${trip.type === "AC" ? "ac" : ""}`}>{trip.type}</span></span>
            <span className="route-subtitle">{trip.operator} <span className="dot-separator">·</span> to {trip.terminusTo}</span>
          </span>
        </span>

        <span className="trip-times">
          <span className="trip-time-place">
            <span className="trip-clock"><time>{departure.time}</time><span>{departure.period}</span></span>
            <span className="trip-stop-name">{trip.boarding}</span>
          </span>
          <span className="journey-connector" aria-label={`${formatDuration(trip.duration)} journey`}>
            <span className="connector-line"><i /><i /></span>
            <span>{formatDuration(trip.duration)}</span>
          </span>
          <span className="trip-time-place arrival">
            <span className="trip-clock"><time>{arrival.time}</time><span>{arrival.period}</span></span>
            <span className="trip-stop-name">{trip.alighting}</span>
          </span>
        </span>

        <span className="details-hint"><span>All stops</span><ArrowUpRight size={15} aria-hidden="true" /></span>
      </button>
      <div className="trip-bottom">
        <span className="via-label"><CornerDownRight size={15} aria-hidden="true" /> Via {via}</span>
        {firstUpcoming ? <span className="next-label"><span /> Next departure</span> : <span className="scheduled-label"><Clock3 size={13} /> {KIND_LABEL[trip.kind]}</span>}
        <span className="click-hint">Click for full details</span>
      </div>
    </article>
  );
}
