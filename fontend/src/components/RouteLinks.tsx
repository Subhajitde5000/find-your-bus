import { BusFront, CornerDownRight, Info } from "lucide-react";
import type { RouteLink } from "@/lib/timetables";

function viaLabel(via: string[]): string {
  if (!via.length) return "Direct journey";
  const shown = via.slice(0, 3).join(" · ");
  return `Via ${shown}${via.length > 3 ? ` · +${via.length - 3} more` : ""}`;
}

/**
 * Buses that connect the searched stops but have no published times. They are listed without any
 * time on purpose: the site never shows a departure it cannot back up.
 */
export function RouteLinks({ links, noTrips }: { links: RouteLink[]; noTrips: boolean }) {
  if (!links.length) return null;
  const one = links.length === 1;
  return (
    <section className={`route-links${noTrips ? " bare" : ""}`} aria-label="Buses with no published timetable">
      {/* When there are no timed buses at all the page already says so above, so the box stays quiet. */}
      {!noTrips && (
        <div className="route-links-head">
          <Info size={17} aria-hidden="true" />
          <div>
            <h3>{one ? "Another bus connects" : "More buses connect"} your stops — no published timetable yet</h3>
            {/* City buses here run to frequency, so no operator publishes times for them. See
                data/TIMETABLE_SOURCE_AUDIT.md for the sources checked. */}
            <p>City buses in Kolkata run to frequency, so most have no published times. We only show times we can back up — ask at the stop or check with the operator.</p>
          </div>
        </div>
      )}
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <span className={`route-square small ${link.type === "AC" ? "ac" : ""}`}><BusFront size={17} strokeWidth={2.1} aria-hidden="true" /></span>
            <div>
              <strong>{link.number}<span className={`type-badge ${link.type === "AC" ? "ac" : ""}`}>{link.type}</span></strong>
              <span>{link.operator} · to {link.terminusTo}</span>
              <span className="route-link-via"><CornerDownRight size={13} aria-hidden="true" /> {viaLabel(link.via)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
