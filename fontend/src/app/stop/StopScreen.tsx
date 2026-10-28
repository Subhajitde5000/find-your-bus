"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Clock3,
  Filter,
  Info,
  MapPin,
  MapPinOff,
  QrCode,
  Search,
  Sunrise,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { OpenInApp } from "@/components/OpenInApp";
import { StopSearchBox } from "@/components/StopSearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";
import { formatClock } from "@/lib/timetables";
import {
  getStopPasses,
  passesByHour,
  upcomingPasses,
  shortWaitLabel,
  waitLabel,
  type StopPass,
  type UpcomingPass,
} from "@/lib/stopTimetable";
import { useKolkataMinute } from "@/lib/useKolkataMinute";

/*
 * /stop?stop=Esplanade — the screen a QR sticker at a bus stop opens.
 *
 * Two questions, in the order a passenger standing at the stop asks them:
 *
 *   - "What is coming next?"   the next buses from now, with a wait;
 *   - "What passes here at all today?"   the whole day, hour by hour.
 *
 * The times are published passage times from the bundled directory. Nothing here is
 * live: Pathsathi does not know where any bus is, and the page says so once, plainly,
 * rather than decorating every row with a warning.
 *
 * It works with no network and no install, which is the point of a sticker at a stop:
 * a tourist, a visitor, or a broken phone gets the same timetable as an installed app.
 * The page is one static document for every stop in the city, so the address in the QR
 * is stable and the service worker caches exactly one page for all 2,194 stops.
 *
 * The toolbar sticks under the header: a passenger scrolling the whole day should be
 * able to switch back to "next buses" without climbing back to the top of the page.
 */

type View = "next" | "day";

/** A hub like Esplanade has thousands of passes a day; an hour of them is still a lot. */
const ROWS_PER_HOUR_INITIAL = 40;
const NEXT_LIMIT = 30;

function PassRow({ pass, stopName, wait }: { pass: StopPass | UpcomingPass; stopName: string; wait?: string }) {
  const clock = formatClock(pass.clock);
  const nextDay = "nextDay" in pass && pass.nextDay;
  const href = `/ride?route=${encodeURIComponent(pass.routeNumber)}&dir=${pass.direction}&from=${encodeURIComponent(stopName)}`;
  return (
    <li className="stop-pass">
      <div className="stop-pass-time">
        <strong>
          {clock.time}
          <span>{clock.period}</span>
        </strong>
      </div>
      <div className="stop-pass-main">
        <div className="stop-pass-route">
          <strong>{pass.routeNumber.replace(/_/g, " ")}</strong>
          {pass.routeType === "AC" && <span className="type-badge ac">AC</span>}
        </div>
        <span className="stop-pass-towards">
          <ArrowRight size={11} aria-hidden="true" /> {pass.towards}
        </span>
        <span className="stop-pass-meta">
          {pass.operator}
          {pass.bus ? ` · ${pass.bus}` : ""}
        </span>
      </div>
      <div className="stop-pass-end">
        {wait ? (
          <em className="stop-wait">{wait}</em>
        ) : nextDay ? (
          <em className="stop-wait nextday">tomorrow</em>
        ) : null}
        <Link className="stop-pass-go" href={href} aria-label={`Set on bus ${pass.routeNumber} towards ${pass.towards}`} title="Set on bus">
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}

function StopScreen() {
  const search = useSearchParams();
  const router = useRouter();
  const asked = (search.get("stop") ?? "").trim();
  const nowMinutes = useKolkataMinute();
  const [online, setOnline] = useState(true);
  const [view, setView] = useState<View>("next");
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [openHours, setOpenHours] = useState<Set<number> | null>(null);
  const [expandedHour, setExpandedHour] = useState<number | null>(null);
  const dayRef = useRef<HTMLDivElement | null>(null);

  const stop = useMemo(() => (asked ? getStopPasses(asked) : null), [asked]);

  useEffect(() => {
    const sync = () => setOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const title = stop?.inDirectory ? stop.stop : asked;
  useEffect(() => {
    if (!title) return;
    document.title = `${title} — bus times · Pathsathi`;
  }, [title]);

  // The hour a passenger is standing in opens by itself, so "all buses today" starts
  // where they are rather than at midnight.
  const currentHour = Math.floor(nowMinutes / 60);
  if (nowMinutes > 0 && openHours === null) setOpenHours(new Set([currentHour]));

  const filtered = useMemo(() => {
    if (!stop) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return stop.passes;
    return stop.passes.filter(
      (pass) => pass.routeNumber.toLowerCase().includes(needle) || pass.towards.toLowerCase().includes(needle),
    );
  }, [stop, query]);

  const next = useMemo(
    () => (nowMinutes > 0 ? upcomingPasses(filtered, nowMinutes, NEXT_LIMIT) : []),
    [filtered, nowMinutes],
  );
  const hours = useMemo(() => passesByHour(filtered), [filtered]);
  const filteredUntimed = useMemo(() => {
    if (!stop) return [];
    const needle = query.trim().toLowerCase();
    return stop.routes.filter((route) => !route.timed && (!needle || route.number.toLowerCase().includes(needle)));
  }, [stop, query]);

  const jumpToNow = useCallback(() => {
    setView("day");
    setOpenHours((current) => {
      const updated = new Set(current ?? []);
      updated.add(currentHour);
      return updated;
    });
    // jsdom (and old browsers) have no scrollIntoView; scrolling is a nicety, not the feature.
    window.setTimeout(() => {
      const node = dayRef.current?.querySelector(`[data-hour="${currentHour}"]`);
      if (node && typeof (node as HTMLElement).scrollIntoView === "function") {
        (node as HTMLElement).scrollIntoView({ block: "start", behavior: "smooth" });
      }
    }, 60);
  }, [currentHour]);

  const toggleHour = (hour: number) =>
    setOpenHours((current) => {
      const updated = new Set(current ?? []);
      if (updated.has(hour)) updated.delete(hour);
      else updated.add(hour);
      return updated;
    });

  /* ---------------------------------------------------------- no stop in the link */

  if (!asked) {
    return (
      <div className="ride-page stop-page">
        <StopHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPin size={24} /></span>
            <h1>Which bus stop?</h1>
            <p>
              This page is opened by the QR sticker at a bus stop. Search for the stop below, or
              scan the sticker again.
            </p>
            <div className="qr-picker">
              <StopSearchBox
                label="Find a bus stop"
                placeholder="Stop name, e.g. Garia"
                onPick={(name) => router.push(`/stop?stop=${encodeURIComponent(name)}`)}
              />
            </div>
            <div className="qr-notice-actions">
              <Link className="ride-primary" href="/scan"><QrCode size={15} /> Scan a QR code</Link>
              <Link className="ride-secondary" href="/map"><MapPin size={15} /> All stops on the map</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!stop || !stop.inDirectory) {
    return (
      <div className="ride-page stop-page">
        <StopHeader online={online} />
        <main className="ride-body">
          <div className="ride-notice-block">
            <span className="ride-notice-icon"><MapPinOff size={24} /></span>
            <h1>{asked} is not a stop in this directory</h1>
            <p>
              The QR sticker names a stop that this copy of Pathsathi does not know, or the name was
              typed differently. Search for it instead.
            </p>
            <div className="qr-picker">
              <StopSearchBox
                label="Find the stop"
                placeholder="Search every stop"
                onPick={(name) => router.push(`/stop?stop=${encodeURIComponent(name)}`)}
              />
            </div>
            <div className="qr-notice-actions">
              <Link className="ride-primary" href="/scan"><QrCode size={15} /> Scan the sticker again</Link>
              <Link className="ride-secondary" href="/">Home</Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const buses = stop.routes.length;
  const today = stop.passes.length;
  const soonest = next[0] ?? null;
  const filterActive = query.trim().length > 0;

  return (
    <div className="ride-page stop-page">
      <StopHeader online={online} />

      <main className="ride-body">
        <header className="stop-head">
          <div className="stop-head-top">
            <span className="stop-head-mark"><MapPin size={17} aria-hidden="true" /></span>
            <h1>{stop.stop}</h1>
          </div>
          <p className="stop-head-meta">
            {buses === 0
              ? "No bus in this directory calls here."
              : `${buses} bus${buses === 1 ? "" : "es"} stop${buses === 1 ? "s" : ""} here · ${today} scheduled pass${today === 1 ? "" : "es"} today`}
          </p>
          <p className="stop-head-fact">
            <Clock3 size={12} aria-hidden="true" />
            Published times, not live positions
            {nowMinutes > 0 && (
              <span className="stop-head-now">
                now {formatClock(nowMinutes).time} {formatClock(nowMinutes).period}
              </span>
            )}
          </p>
        </header>

        <div className="stop-toolbar">
          <div className="stop-tabs" role="tablist" aria-label="Timetable view">
            <button
              type="button"
              role="tab"
              aria-selected={view === "next"}
              className={view === "next" ? "on" : undefined}
              onClick={() => setView("next")}
            >
              <Sunrise size={14} aria-hidden="true" /> Next
              {soonestBadge(soonest?.deltaMinutes)}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "day"}
              className={view === "day" ? "on" : undefined}
              onClick={() => setView("day")}
            >
              <Clock3 size={14} aria-hidden="true" /> Whole day
              <span className="stop-tab-count">{today}</span>
            </button>
          </div>
          <button
            type="button"
            className={`stop-filter-toggle ${filterActive ? "on" : ""}`}
            aria-expanded={filterOpen || filterActive}
            aria-label="Filter the list by route or destination"
            onClick={() => setFilterOpen((open) => !open)}
          >
            <Filter size={15} aria-hidden="true" />
            <span className="stop-filter-text">{filterActive ? "Filtered" : "Filter"}</span>
          </button>
        </div>

        {(filterOpen || filterActive) && (
          <label className="stop-filter">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              placeholder="Route number or destination"
              aria-label="Filter by route number or destination"
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear the filter">
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
        )}

        {view === "next" && (
          <section className="stop-section" aria-live="polite">
            <header className="stop-section-head">
              <h2>
                <span className="stop-kicker">Next buses</span>
                {nowMinutes > 0
                  ? `From ${formatClock(nowMinutes).time} ${formatClock(nowMinutes).period}`
                  : "Leaving now"}
              </h2>
              {next.length > 0 && <span>{next.length} shown</span>}
            </header>
            {nowMinutes === 0 ? (
              <div className="stop-empty">Reading the timetable…</div>
            ) : next.length === 0 ? (
              <div className="stop-empty">
                {filterActive
                  ? `No bus matching “${query}” passes ${stop.stop} today.`
                  : `No more scheduled buses pass ${stop.stop} today. The whole day is on the next tab.`}
              </div>
            ) : (
              <ol className="stop-pass-list">
                {next.map((pass, index) => (
                  <PassRow
                    key={`${pass.routeNumber}-${pass.direction}-${pass.runCode ?? index}-${pass.clock}`}
                    pass={pass}
                    stopName={stop.stop}
                    wait={waitLabel(pass.deltaMinutes)}
                  />
                ))}
              </ol>
            )}
            {next.length > 0 && (
              <div className="stop-section-actions">
                <button type="button" className="stop-cta" onClick={jumpToNow}>
                  <Clock3 size={14} aria-hidden="true" /> Jump to now in the whole day
                </button>
              </div>
            )}
          </section>
        )}

        {view === "day" && (
          <section className="stop-section" ref={dayRef}>
            <header className="stop-section-head">
              <h2>
                <span className="stop-kicker">Whole day</span>
                All published passes
              </h2>
              <span>{filtered.length} pass{filtered.length === 1 ? "" : "es"}</span>
            </header>
            {hours.length === 0 ? (
              <div className="stop-empty">
                {filterActive ? `No bus matching “${query}” passes ${stop.stop} today.` : `No published times at ${stop.stop} today.`}
              </div>
            ) : (
              <div className="stop-hours">
                {hours.map((group) => {
                  const open = openHours?.has(group.hour) ?? false;
                  const showAll = expandedHour === group.hour;
                  const rows = showAll ? group.passes : group.passes.slice(0, ROWS_PER_HOUR_INITIAL);
                  const isNow = nowMinutes > 0 && currentHour === group.hour;
                  const isPast = nowMinutes > 0 && group.hour < currentHour;
                  return (
                    <section
                      className={`stop-hour ${isNow ? "now" : ""} ${isPast ? "past" : ""}`}
                      key={group.hour}
                      data-hour={group.hour}
                    >
                      <button type="button" className="stop-hour-head" aria-expanded={open} onClick={() => toggleHour(group.hour)}>
                        <span className="stop-hour-label">
                          {String(group.hour % 24).padStart(2, "0")}:00
                          {isNow && <em>now</em>}
                        </span>
                        <span className="stop-hour-count">
                          {group.passes.length} bus{group.passes.length === 1 ? "" : "es"}
                        </span>
                        <ChevronDown size={15} aria-hidden="true" className={open ? "open" : undefined} />
                      </button>
                      {open && (
                        <>
                          <ol className="stop-pass-list">
                            {rows.map((pass, index) => (
                              <PassRow
                                key={`${pass.routeNumber}-${pass.direction}-${pass.runCode ?? index}-${pass.clock}`}
                                pass={pass}
                                stopName={stop.stop}
                              />
                            ))}
                          </ol>
                          {group.passes.length > rows.length && (
                            <button type="button" className="stop-more" onClick={() => setExpandedHour(group.hour)}>
                              Show the other {group.passes.length - rows.length} buses in this hour
                            </button>
                          )}
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {filteredUntimed.length > 0 && (
          <section className="stop-untimed">
            <h2>Buses here with no published times</h2>
            <p>
              {filteredUntimed.length} route{filteredUntimed.length === 1 ? "" : "s"} call here but the
              directory prints no passage time for {filteredUntimed.length === 1 ? "it" : "them"}, so
              there is no time to show. Their stops are still in the route list.
            </p>
            <div className="stop-untimed-chips">
              {filteredUntimed.slice(0, 30).map((route) => (
                <Link key={route.number} href={`/ride?route=${encodeURIComponent(route.number)}&dir=outbound&from=${encodeURIComponent(stop.stop)}`}>
                  {route.number}
                </Link>
              ))}
            </div>
          </section>
        )}

        <nav className="ob-ways" aria-label="Other ways to use this screen">
          <Link className="ob-way" href="/map">
            <MapPin size={15} aria-hidden="true" /> This stop on the map
          </Link>
          <Link className="ob-way" href="/scan">
            <QrCode size={15} aria-hidden="true" /> Scan another code
          </Link>
          <Link className="ob-way" href="/">
            <Search size={15} aria-hidden="true" /> Search a journey instead
          </Link>
        </nav>

        <details className="ob-footnote">
          <summary>
            <Info size={15} aria-hidden="true" /> What these times are
          </summary>
          <ul>
            <li>
              <strong>Scheduled, not live.</strong> These are the times the operator publishes for
              this stop. Pathsathi does not track buses, so a bus can be early, late, full, or missing.
            </li>
            <li>
              <strong>The whole day, not twenty-four hours.</strong> A bus that leaves before
              midnight and reaches this stop at 00:20 is listed under 00:00, on the day it passes
              here.
            </li>
            <li>
              <strong>One page for every stop.</strong> This screen is the same document for all
              2,194 stops, which is why it loads instantly and works with no signal once visited.
            </li>
            <li>
              <strong>Tap a bus</strong> to set it on the bus screen: your position, the next stop
              and the countdown to where you are going.
            </li>
          </ul>
          <p className="ob-footnote-sign">
            Timetable from the operator&apos;s published directory. Not official travel advice.
          </p>
        </details>

        <OpenInApp />
      </main>
    </div>
  );
}

/** A tiny "next in 4 min" badge on the tab, so the wait is readable at a glance. */
function soonestBadge(deltaMinutes: number | undefined) {
  if (deltaMinutes === undefined) return null;
  return <span className="stop-tab-count">{shortWaitLabel(deltaMinutes)}</span>;
}

function StopHeader({ online }: { online: boolean }) {
  return (
    <header className="ride-header">
      <Link className="ride-back" href="/" aria-label="Home">
        <ArrowLeft size={17} aria-hidden="true" />
        <span className="ride-back-text">Home</span>
      </Link>
      <span className="ride-header-title">Bus stop</span>
      <Link className="ride-header-scan" href="/scan" aria-label="Scan a QR code" title="Scan a QR code">
        <QrCode size={17} />
      </Link>
      <span className={`ride-online ${online ? "" : "off"}`} title={online ? "Online" : "Offline — this page still works"}>
        {online ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
        <span className="ride-online-text">{online ? "Online" : "Offline"}</span>
      </span>
      <ThemeToggle />
    </header>
  );
}

export default function StopPage() {
  return (
    <Suspense
      fallback={
        <div className="ride-page">
          <div className="ride-loading">Opening the bus stop…</div>
        </div>
      }
    >
      <StopScreen />
    </Suspense>
  );
}
