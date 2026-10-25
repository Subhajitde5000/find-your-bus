"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BusFront,
  CalendarClock,
  Clock3,
  Compass,
  Info,
  LocateFixed,
  MapPin,
  MapPinOff,
  ScanLine,
  Timer,
  TriangleAlert,
} from "lucide-react";
import { QrHeader } from "@/components/QrHeader";
import { StopSearchBox } from "@/components/StopSearchBox";
import { formatClock } from "@/lib/timetables";
import {
  buildStopBoard,
  duePhrase,
  groupPassages,
  restOfDay,
  timedRouteCount,
  upcomingPassages,
  wholeDay,
  type BoardPassage,
  type StopBoard,
} from "@/lib/stopBoard";
import { nearestStops, STOP_INDEX } from "@/lib/stopIndex";
import { formatDistance, haversineMetres } from "@/lib/geo";
import { usePosition } from "@/lib/usePosition";
import { useKolkataMinute } from "@/lib/useKolkataMinute";

/*
 * /qr/stop — the sticker on a bus shelter.
 *
 * It answers two questions on one page: what is coming in the next couple of hours, and
 * what the whole day looks like. Times are published passage times from the bundled
 * timetable, so the board works with no signal; it is not a live arrival display and
 * says so.
 *
 * Real conditions this handles:
 *   - a stop name the directory does not know (or a misspelt one), with a way to pick;
 *   - a stop with no routes at all, and a stop with routes but no published times;
 *   - after-midnight runs, which belong to the same service day (see stopBoard.ts);
 *   - a phone at a different stop than the sticker says (it says how far away it is);
 *   - no location permission: the board itself never needs it.
 */

type Tab = "next" | "rest" | "all";

/**
 * A busy stop can publish hundreds of buses in two hours. The first screenful is what
 * anyone actually reads, so the rest is one tap away instead of a long scroll.
 */
const ROW_LIMIT = { next: 40, rest: 60 } as const;

function StopScreen() {
  const search = useSearchParams();
  const nowMinutes = useKolkataMinute();
  const position = usePosition();
  const [stop, setStop] = useState<string | null>(() => (search.get("s") ?? search.get("stop") ?? "").trim() || null);
  const [picking, setPicking] = useState(false);
  const [tab, setTab] = useState<Tab>("next");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (position.status === "idle") position.locate();
  }, [position]);

  const board: StopBoard | null = useMemo(
    () => (stop && nowMinutes > 0 ? buildStopBoard(stop, nowMinutes) : null),
    [stop, nowMinutes],
  );

  const nearby = useMemo(
    () => (position.fix ? nearestStops(STOP_INDEX, position.fix, { limit: 5, maxMetres: 1500, withBusesOnly: true }) : []),
    [position.fix],
  );

  const allRows: BoardPassage[] = !board
    ? []
    : tab === "next"
      ? upcomingPassages(board, 120)
      : tab === "rest"
        ? restOfDay(board)
        : wholeDay(board);
  const limit = tab === "all" ? allRows.length : ROW_LIMIT[tab];
  const rows = expanded ? allRows : allRows.slice(0, limit);
  const hidden = allRows.length - rows.length;
  const groups = tab === "all" ? groupPassages(allRows) : [];

  const changeTab = (next: Tab) => {
    setTab(next);
    setExpanded(false);
  };

  const metresAway =
    board && board.position && position.fix
      ? Math.round(haversineMetres(board.position, { lat: position.fix.lat, lng: position.fix.lng }))
      : null;
  /** The rest of the service day, used by the three summary facts. */
  const rest = board ? upcomingPassages(board, 1440) : [];

  if (!stop) {
    return (
      <div className="ride-page">
        <QrHeader title="At the stop" />
        <main className="ride-body">
          <section className="ride-status" data-state="waiting">
            <span className="ride-status-icon"><Compass size={22} /></span>
            <div className="ride-status-text">
              <h1>Which stop are you at?</h1>
              <p>
                This sticker should name its stop. If you opened the page another way, pick the stop
                you are standing at — or scan the sticker again.
              </p>
            </div>
            <div className="ride-status-actions">
              <Link className="ride-primary" href="/scan"><ScanLine size={16} aria-hidden="true" /> Scan a sticker</Link>
            </div>
          </section>

          {position.status === "locating" && <p className="qr-panel-note">Looking for stops near you…</p>}
          {position.status !== "ready" && position.status !== "idle" && position.status !== "locating" && (
            <div className="qr-hint">
              <TriangleAlert size={16} aria-hidden="true" />
              <span>{position.message ?? "Location is unavailable."} You can search for the stop instead.</span>
              <button type="button" onClick={position.locate}><LocateFixed size={13} aria-hidden="true" /> Try again</button>
            </div>
          )}

          {nearby.length > 0 && (
            <section className="qr-panel">
              <h2>Nearest stops to you</h2>
              <div className="qr-stop-choices">
                {nearby.map((item) => (
                  <button key={item.stop.name} type="button" onClick={() => setStop(item.stop.name)}>
                    <MapPin size={14} aria-hidden="true" />
                    <span>{item.stop.name}</span>
                    <em>{formatDistance(item.metres)} · {item.stop.buses.length} buses</em>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="qr-panel">
            <h2>Search for the stop</h2>
            <StopSearchBox onPick={(name) => setStop(name)} placeholder="Stop name, e.g. Esplanade" label="Search a stop" />
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="ride-page">
      <QrHeader title="At the stop" />

      <main className="ride-body qr-body">
        <header className="ride-route">
          <span className="route-square"><MapPin size={20} strokeWidth={2.1} aria-hidden="true" /></span>
          <div className="ride-route-text">
            <div className="ride-route-row">
              <strong className="qr-stop-title">{stop}</strong>
              <span className="qr-sticker-tag">Bus stop sticker</span>
            </div>
            <span className="ride-operator">
              {board && board.known
                ? `${board.routes.length} route${board.routes.length === 1 ? "" : "s"} call here${timedRouteCount(board) > 0 ? ` · ${timedRouteCount(board)} with published times` : ""}`
                : "This name is not in the directory"}
            </span>
            {metresAway !== null && (
              <span className="qr-fact-meta">
                {metresAway < 60 ? "You are at this stop" : `${formatDistance(metresAway)} from this stop`}
                {board?.position === null ? " · this stop has no mapped position" : ""}
              </span>
            )}
          </div>
          <button type="button" className="ride-secondary" onClick={() => setPicking((value) => !value)}>
            <MapPin size={15} aria-hidden="true" /> Change
          </button>
        </header>

        {picking && (
          <section className="qr-panel">
            <h2>Another stop</h2>
            <StopSearchBox onPick={(name) => { setStop(name); setPicking(false); }} placeholder="Stop name" label="Search a stop" />
            {nearby.length > 0 && (
              <div className="qr-stop-choices">
                {nearby.map((item) => (
                  <button key={item.stop.name} type="button" onClick={() => { setStop(item.stop.name); setPicking(false); }}>
                    <MapPin size={14} aria-hidden="true" />
                    <span>{item.stop.name}</span>
                    <em>{formatDistance(item.metres)}</em>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {!board && <div className="ride-loading">Reading the timetable…</div>}

        {board && !board.known && (
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>No stop with that name</h1>
            <p>
              The directory has no stop called “{stop}”. Stickers are printed from the same directory,
              so this usually means a misspelt link. Search for the stop again.
            </p>
            <button type="button" className="ride-primary" onClick={() => setPicking(true)}>
              <MapPin size={15} aria-hidden="true" /> Pick another stop
            </button>
          </div>
        )}

        {board && board.known && (
          <>
            <section className="qr-facts" aria-label="This stop today">
              <div className="qr-fact">
                <span className="qr-fact-label"><Clock3 size={12} aria-hidden="true" /> Now, Kolkata</span>
                <strong>{formatClock(board.now).time} {formatClock(board.now).period}</strong>
                <span className="qr-fact-meta">the board updates itself</span>
              </div>
              <div className="qr-fact">
                <span className="qr-fact-label"><CalendarClock size={12} aria-hidden="true" /> Service today</span>
                <strong className="qr-fact-small">
                  {board.timed.length > 0
                    ? `${formatClock(board.timed[0].passage.minutes).time} – ${formatClock(board.timed[board.timed.length - 1].passage.minutes).time}`
                    : "no published times"}
                </strong>
                <span className="qr-fact-meta">
                  {board.timed.length} passage{board.timed.length === 1 ? "" : "s"} at this stop
                </span>
              </div>
              <div className="qr-fact">
                <span className="qr-fact-label"><Timer size={12} aria-hidden="true" /> Next bus</span>
                <strong className="qr-fact-small">
                  {rest[0] ? `${rest[0].clock.time} ${rest[0].clock.period}` : "none left today"}
                </strong>
                <span className="qr-fact-meta">
                  {rest[0]
                    ? `route ${rest[0].passage.route} · ${duePhrase(rest[0].aheadMinutes).toLowerCase()}`
                    : "check again tomorrow morning"}
                </span>
              </div>
            </section>

            <div className="qr-tabs" role="tablist" aria-label="Which passes to show">
              <button type="button" role="tab" aria-selected={tab === "next"} className={tab === "next" ? "active" : ""} onClick={() => changeTab("next")}>
                Next 2 hours
              </button>
              <button type="button" role="tab" aria-selected={tab === "rest"} className={tab === "rest" ? "active" : ""} onClick={() => changeTab("rest")}>
                Rest of today
              </button>
              <button type="button" role="tab" aria-selected={tab === "all"} className={tab === "all" ? "active" : ""} onClick={() => changeTab("all")}>
                Whole day
              </button>
            </div>

            <section className="qr-board" aria-label="Buses at this stop" aria-live="polite">
              {allRows.length === 0 ? (
                <div className="qr-board-empty">
                  <span className="empty-icon"><BusFront size={22} aria-hidden="true" /></span>
                  <h3>{tab === "next" ? "Nothing in the next two hours" : "No buses left today"}</h3>
                  <p>
                    {board.timed.length === 0
                      ? "No route that calls here publishes passage times. The routes themselves are listed below."
                      : tab === "next"
                        ? "Try “Rest of today” or “Whole day” — the gap may just be a quiet stretch."
                        : "The published service at this stop has finished. The whole day is still on the “Whole day” tab."}
                  </p>
                </div>
              ) : tab === "all" ? (
                <div className="qr-day-groups">
                  {groups.map((group) => (
                    <details className="qr-day-group" key={group.key}>
                      <summary>
                        <span className="qr-day-route">
                          <span className={`route-square small ${group.type === "AC" ? "ac" : ""}`}>
                            <BusFront size={14} aria-hidden="true" />
                          </span>
                          <strong>{group.route}</strong>
                        </span>
                        <span className="qr-day-towards">Towards {group.towards}</span>
                        <span className="qr-day-count">
                          {group.rows.length} pass{group.rows.length === 1 ? "" : "es"}
                          {group.passed > 0 ? ` · ${group.passed} gone` : ""}
                        </span>
                      </summary>
                      <div className="qr-day-times">
                        {group.rows.map((row, index) => (
                          <span
                            key={`${row.passage.minutes}-${row.passage.runCode ?? "sample"}-${index}`}
                            data-passed={row.passed}
                            title={row.passage.runCode ? `Run ${row.passage.runCode}` : "Sample frequency"}
                          >
                            {row.clock.time}
                            <em>{row.clock.period}</em>
                          </span>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <>
                  <ul className="qr-pass-list">
                    {rows.map((row, index) => (
                      <PassageRow
                        key={`${row.passage.route}-${row.passage.direction}-${row.passage.runCode ?? "sample"}-${row.passage.minutes}-${index}`}
                        row={row}
                        stop={board.stop}
                        showAhead
                      />
                    ))}
                  </ul>
                  {hidden > 0 && (
                    <button type="button" className="qr-board-more" onClick={() => setExpanded(true)}>
                      Show {hidden} more pass{hidden === 1 ? "" : "es"}
                    </button>
                  )}
                </>
              )}
            </section>

            {board.untimed.length > 0 && (
              <section className="qr-panel">
                <h2>Routes with no published times</h2>
                <p className="qr-panel-note">
                  These buses call here, but the workbook has no passage time, so no time is shown.
                </p>
                <ul className="qr-route-chips">
                  {board.untimed.map((route) => (
                    <li key={route.number}>
                      <Link href={`/qr/bus?r=${encodeURIComponent(route.number)}&from=${encodeURIComponent(board.stop)}`}>
                        <strong>{route.number}</strong>
                        <span>{route.origin} to {route.destination}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="qr-panel">
              <h2>Every route at this stop</h2>
              <ul className="qr-route-chips">
                {board.routes.map((route) => (
                  <li key={route.number}>
                    <Link href={`/qr/bus?r=${encodeURIComponent(route.number)}&from=${encodeURIComponent(board.stop)}`}>
                      <strong>{route.number}</strong>
                      <span>{route.origin} to {route.destination}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className="ride-footnote">
              <h2><Info size={15} aria-hidden="true" /> How to read this board</h2>
              <ul>
                <li>
                  <strong>Published times, not live arrivals.</strong> Each time is the passage time the
                  operator publishes for that run, which is what a printed timetable shows. No bus is
                  tracked and nothing is fetched.
                </li>
                <li>
                  <strong>After midnight belongs to the same day.</strong> A bus at 00:20 is the last run
                  of tonight&apos;s service, not the first of tomorrow&apos;s, so the day here starts at
                  03:30.
                </li>
                <li>
                  <strong>Both directions are shown.</strong> Each row says which terminus it is heading
                  to, because a stop in the middle of a route is served from both sides.
                </li>
                <li>
                  <strong>No signal needed.</strong> The timetable, the stop and the bus lists are inside
                  the page; the board will keep working in a shelter with no bars.
                </li>
              </ul>
              <p className="ride-footnote-sign">
                Not live tracking, and not official travel advice. Confirm with the conductor before you travel.
              </p>
            </section>

            <section className="qr-actions">
              <Link className="ride-primary" href="/scan"><ScanLine size={16} aria-hidden="true" /> Scan another sticker</Link>
              <Link className="ride-secondary" href={`/map`}><MapPin size={15} aria-hidden="true" /> All stops on the map</Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}


/** One row of the board. */
function PassageRow({ row, stop, showAhead }: { row: BoardPassage; stop: string; showAhead: boolean }) {
  const { passage } = row;
  // The other half of the same idea: from this stop, open the on-bus screen for the bus
  // that is about to arrive, already knowing the route, direction and boarding stop.
  const href = `/qr/bus?r=${encodeURIComponent(passage.route)}&d=${passage.direction === "return" ? "r" : "o"}&from=${encodeURIComponent(stop)}`;
  return (
    <li className="qr-pass" data-passed={showAhead ? undefined : row.passed}>
      <span className="qr-pass-time">
        {row.clock.time}
        <em>{row.clock.period}</em>
      </span>
      <span className="qr-pass-route">
        <span className={`route-square small ${passage.type === "AC" ? "ac" : ""}`}><BusFront size={14} aria-hidden="true" /></span>
        <strong>{passage.route}</strong>
      </span>
      <span className="qr-pass-text">
        <strong>
          Towards {passage.destination}
          {passage.type === "AC" && <span className="type-badge ac">AC</span>}
          {passage.kind === "sample" && <span className="type-badge">Sample</span>}
        </strong>
        <span>
          {passage.runCode ? `Run ${passage.runCode}` : "Sample frequency"}
          {passage.bus ? ` · bus ${passage.bus}` : ""}
          {row.afterMidnight ? " · after midnight" : ""}
        </span>
      </span>
      <span className="qr-pass-in">
        {showAhead ? duePhrase(row.aheadMinutes) : row.passed ? "passed" : duePhrase(row.aheadMinutes)}
        <Link href={href} aria-label={`Open route ${passage.route} from ${passage.origin}`}>
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </span>
    </li>
  );
}

export default function StopQrPage() {
  return (
    <Suspense
      fallback={
        <div className="ride-page">
          <div className="ride-loading">Loading the stop…</div>
        </div>
      }
    >
      <StopScreen />
    </Suspense>
  );
}
