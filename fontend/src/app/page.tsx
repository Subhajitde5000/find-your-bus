"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Accessibility,
  ArrowLeftRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BusFront,
  CalendarDays,
  Check,
  Clock3,
  Repeat,
  Share2,
  History as HistoryIcon,
  Info,
  Lightbulb,
  MapPin,
  LocateFixed,
  Menu,
  Navigation,
  PersonStanding,
  Route,
  Search,
  Sunrise,
  Users,
} from "lucide-react";
import { BusDetailModal } from "@/components/BusDetailModal";
import { HeroMap } from "@/components/HeroMap";
import { SiteSidebar } from "@/components/SiteSidebar";
import { StopField } from "@/components/StopField";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RouteLinks } from "@/components/RouteLinks";
import { TripCard } from "@/components/TripCard";
import { RouteExplorer } from "@/components/RouteExplorer";
import styles from "./HomeShell.module.css";
import {
  DATA_COUNTS,
  findRouteLinks,
  findTransferPlans,
  findTrip,
  findTrips,
  formatClock,
  formatDuration,
  parseClock,
  POPULAR_JOURNEYS,
  resolveStop,
  toClock24,
  type BusTrip,
  type ServiceType,
} from "@/lib/timetables";

type View = "upcoming" | "all";
type TypeFilter = "all" | ServiceType;
type Journey = { from: string; to: string; time: string };

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage can be blocked (private mode, full quota); the app still works without it
  }
}

/** Reads ?from=&to=&time=HHMM so a search can be shared as a link. */
function readSharedJourney(): Journey | null {
  const params = new URLSearchParams(window.location.search);
  const from = resolveStop(params.get("from") ?? "");
  const to = resolveStop(params.get("to") ?? "");
  if (!from || !to || from === to) return null;
  const raw = (params.get("time") ?? "").replace(":", "");
  const time = /^\d{4}$/.test(raw) && Number(raw.slice(0, 2)) < 24 && Number(raw.slice(2)) < 60
    ? `${raw.slice(0, 2)}:${raw.slice(2)}`
    : kolkataTime();
  return { from, to, time };
}

function writeSharedJourney(journey: Journey) {
  const params = new URLSearchParams({ from: journey.from, to: journey.to, time: journey.time.replace(":", "") });
  window.history.replaceState(null, "", `?${params.toString()}`);
}

function kolkataTime(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = parts.find((part) => part.type === "hour")?.value ?? "08";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

function kolkataDate(): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
}

interface HistoryEntry {
  key: string;
  tripId: string;
  from: string;
  to: string;
  number: string;
  type: ServiceType;
  boarding: string;
  alighting: string;
  departure: number;
  viewedAt: number;
}

/**
 * Saved entries can come from an older version of the site (or from a corrupted
 * localStorage), so nothing stored is trusted. The trip is looked up again and the
 * card is rebuilt from that trip: missing `from`/`to` used to make `findTrip` throw
 * and wipe the whole list. Every field shown on the card is rebuilt from the current trip, so an
 * entry saved by an older version cannot keep a stale time or marker.
 */
function readHistoryEntry(item: unknown): HistoryEntry | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<HistoryEntry>;
  if (typeof raw.tripId !== "string" || typeof raw.from !== "string" || typeof raw.to !== "string") return null;
  const trip = findTrip(raw.from, raw.to, raw.tripId);
  if (!trip) return null;
  const viewedAt = typeof raw.viewedAt === "number" && Number.isFinite(raw.viewedAt) ? raw.viewedAt : Date.now();
  return {
    key: `${trip.id}:${raw.from}->${raw.to}`,
    tripId: trip.id,
    from: raw.from,
    to: raw.to,
    number: trip.number,
    type: trip.type,
    boarding: trip.boarding,
    alighting: trip.alighting,
    departure: trip.departure,
    viewedAt,
  };
}

const HISTORY_KEY = "cholo-recent-buses";
const HISTORY_LIMIT = 6;

function timeAgo(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export default function HomePage() {
  const [from, setFrom] = useState("Esplanade");
  const [to, setTo] = useState("Garia");
  const [time, setTime] = useState("08:00");
  const [submitted, setSubmitted] = useState<Journey>({ from: "Esplanade", to: "Garia", time: "08:00" });
  const [view, setView] = useState<View>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [visibleCount, setVisibleCount] = useState(6);
  const [detailTrip, setDetailTrip] = useState<BusTrip | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [errors, setErrors] = useState<{ from?: string; to?: string }>({});
  const [today, setToday] = useState("Today in Kolkata");
  const [quickTimes, setQuickTimes] = useState<{ label: string; value: string }[]>([
    { label: "Morning 9 AM", value: "09:00" },
    { label: "Evening 6 PM", value: "18:00" },
  ]);
  const [showTopButton, setShowTopButton] = useState(false);
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [searchMode, setSearchMode] = useState<"journey" | "route">("journey");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const closeOnDesktop = () => {
      if (!media.matches) setSidebarOpen(false);
    };
    closeOnDesktop();
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      const shared = readSharedJourney();
      if (shared) {
        setFrom(shared.from);
        setTo(shared.to);
        setTime(shared.time);
        setSubmitted(shared);
        setView("upcoming");
      } else {
        const current = kolkataTime();
        setTime(current);
        setSubmitted((journey) => ({ ...journey, time: current }));
      }
      setToday(kolkataDate());
    }, 0);
    const timer = window.setInterval(() => setToday(kolkataDate()), 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const allTrips = useMemo(() => findTrips(submitted.from, submitted.to), [submitted.from, submitted.to]);
  const filteredTrips = useMemo(
    () => allTrips.filter((trip) => typeFilter === "all" || trip.type === typeFilter),
    [allTrips, typeFilter],
  );
  const upcomingTrips = useMemo(
    () => filteredTrips.filter((trip) => trip.departure >= parseClock(submitted.time)),
    [filteredTrips, submitted.time],
  );
  const displayedTrips = view === "upcoming" ? upcomingTrips : filteredTrips;
  const visibleTrips = displayedTrips.slice(0, visibleCount);
  const selectedClock = formatClock(parseClock(submitted.time));
  const transferPlans = useMemo(
    () => (allTrips.length === 0 ? findTransferPlans(submitted.from, submitted.to, parseClock(submitted.time)) : []),
    [allTrips.length, submitted.from, submitted.to, submitted.time],
  );
  const firstBusOfDay = allTrips[0];
  const routeLinks = useMemo(
    () => findRouteLinks(submitted.from, submitted.to).filter((link) => typeFilter === "all" || link.type === typeFilter),
    [submitted.from, submitted.to, typeFilter],
  );
  const countLabel = (() => {
    if (allTrips.length === 0) {
      const parts: string[] = [];
      if (routeLinks.length) parts.push(`${routeLinks.length} ${routeLinks.length === 1 ? "bus" : "buses"} without a timetable`);
      if (transferPlans.length) parts.push(`${transferPlans.length} ${transferPlans.length === 1 ? "route" : "routes"} with 1 change`);
      if (parts.length) return parts.join(" · ");
    }
    return `${displayedTrips.length} ${displayedTrips.length === 1 ? "bus" : "buses"} ${view === "upcoming" ? "after your time" : "today"}`;
  })();

  useEffect(() => {
    const initial = window.setTimeout(() => {
      try {
        const raw = storageGet(HISTORY_KEY);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const valid = parsed
              .map(readHistoryEntry)
              .filter((item): item is HistoryEntry => item !== null);
            setHistory(valid.slice(0, HISTORY_LIMIT));
          }
        }
      } catch {
        // ignore unreadable history
      }
      setHistoryReady(true);
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    if (!historyReady) return;
    storageSet(HISTORY_KEY, JSON.stringify(history));
  }, [history, historyReady]);

  useEffect(() => {
    const onScroll = () => setShowTopButton(window.scrollY > 520);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function openTrip(trip: BusTrip) {
    setDetailTrip(trip);
    setHistory((current) => {
      const entry: HistoryEntry = {
        key: `${trip.id}:${submitted.from}->${submitted.to}`,
        tripId: trip.id,
        from: submitted.from,
        to: submitted.to,
        number: trip.number,
        type: trip.type,
        boarding: trip.boarding,
        alighting: trip.alighting,
        departure: trip.departure,
        viewedAt: Date.now(),
      };
      return [entry, ...current.filter((item) => item.key !== entry.key)].slice(0, HISTORY_LIMIT);
    });
  }

  function openHistoryEntry(entry: HistoryEntry) {
    const trip = allTrips.find((t) => t.id === entry.tripId) || findTrip(entry.from, entry.to, entry.tripId);
    if (trip) setDetailTrip(trip);
  }

  function scrollToResults() {
    window.setTimeout(() => {
      const top = document.getElementById("results")?.getBoundingClientRect().top;
      if (top !== undefined && (top > window.innerHeight * 0.55 || top < 0)) {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 80);
  }

  function commitJourney(journey: Journey) {
    setSubmitted(journey);
    writeSharedJourney(journey);
    setShareStatus("idle");
    setView("upcoming");
    resetResultControls();
    scrollToResults();
  }

  async function shareJourney() {
    const url = window.location.href;
    const title = `${submitted.from} to ${submitted.to} · Cholo`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setShareStatus("failed");
    }
    window.setTimeout(() => setShareStatus("idle"), 2500);
  }

  function resetResultControls() {
    setTypeFilter("all");
    setVisibleCount(6);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validFrom = resolveStop(from);
    const validTo = resolveStop(to);
    const nextErrors: { from?: string; to?: string } = {};
    if (!validFrom) nextErrors.from = "Please choose a stop from the list.";
    if (!validTo) nextErrors.to = "Please choose a stop from the list.";
    if (validFrom && validTo && validFrom === validTo) nextErrors.to = "Choose a different destination.";
    setErrors(nextErrors);
    if (!validFrom || !validTo || validFrom === validTo) return;

    const chosenTime = /^\d{2}:\d{2}$/.test(time) ? time : kolkataTime();
    setFrom(validFrom);
    setTo(validTo);
    setTime(chosenTime);
    commitJourney({ from: validFrom, to: validTo, time: chosenTime });
  }

  function choosePopular(journey: { from: string; to: string }) {
    const chosenTime = /^\d{2}:\d{2}$/.test(time) ? time : kolkataTime();
    setFrom(journey.from);
    setTo(journey.to);
    setTime(chosenTime);
    setErrors({});
    commitJourney({ ...journey, time: chosenTime });
  }

  function handleRouteSelectJourney(fromStop: string, toStop: string) {
    const validFrom = resolveStop(fromStop) || fromStop;
    const validTo = resolveStop(toStop) || toStop;
    setFrom(validFrom);
    setTo(validTo);
    setSearchMode("journey");
    const chosenTime = /^\d{2}:\d{2}$/.test(time) ? time : kolkataTime();
    commitJourney({ from: validFrom, to: validTo, time: chosenTime });
  }

  function changeView(nextView: View) {
    setView(nextView);
    setVisibleCount(6);
  }

  return (
    <div className="site-shell" id="top">
      <header className="site-header">
        <div className={`header-inner page-container ${styles.headerInner}`}>
          <div className={styles.headerBrandGroup}>
            <button
              className={styles.navigationToggle}
              type="button"
              aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
              aria-controls="site-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            <a href="#top" className="brand" aria-label="Cholo home">
              <span className="brand-mark"><BusFront size={23} strokeWidth={2.1} /></span>
              <span className="brand-words"><strong>cholo<span>.</span></strong><small>KOLKATA BUS GUIDE</small></span>
            </a>
          </div>
          <nav className={styles.headerNav} aria-label="Main navigation">
            <a
              className={`${styles.navLink} ${searchMode === "journey" ? styles.navActive : ""}`}
              href="#search"
              onClick={() => setSearchMode("journey")}
            >
              Find a bus
            </a>
            <a
              className={`${styles.navLink} ${searchMode === "route" ? styles.navActive : ""}`}
              href="#search"
              onClick={() => setSearchMode("route")}
            >
              Bus route number
            </a>
            <a className={styles.navLink} href="/map">Stop map</a>
            <a className={styles.navLink} href="#how-it-works">How it works</a>
            <a className={styles.navLink} href="#about">About</a>
          </nav>
          <div className="header-actions">
            <span
              className="city-chip network-chip"
              title="Timetables are bundled with this site. They are not live tracking."
            >
              <span className="city-pulse" aria-hidden="true" />
              <span>{DATA_COUNTS.routes} routes · {DATA_COUNTS.stops} stops · {DATA_COUNTS.stands} stands</span>
            </span>
            <span className="city-chip location-chip"><span className="city-pulse" /><span>Kolkata, WB</span></span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className={styles.layout}>
        <SiteSidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          searchMode={searchMode}
          onSetSearchMode={setSearchMode}
        />
        <main className={styles.content}>
        <section className="hero page-container" aria-labelledby="hero-title">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-mark" /> MADE FOR MOVING AROUND KOLKATA</div>
            <h1 id="hero-title">More going.<br /><span>Less guessing.</span></h1>
            <p className="hero-description">Your everyday guide to Kolkata bus timetables. Find scheduled buses between your stops and make every journey a little easier.</p>
            <div className="hero-points">
              <span><Check size={15} strokeWidth={3} /> No sign-up needed</span>
              <span><Check size={15} strokeWidth={3} /> Today&apos;s schedules</span>
            </div>
          </div>
          <HeroMap />
        </section>

        <section className="search-section page-container" id="search" aria-labelledby="search-title">
          <div className="search-card">
            <div className="search-card-heading">
              <div>
                <div className="section-kicker"><span className="kicker-dash" /> PLAN YOUR RIDE</div>
                <h2 id="search-title">
                  {searchMode === "journey" ? "Where are you headed?" : "Find bus by route number"}
                </h2>
              </div>
              <div className="today-tag"><CalendarDays size={16} /><span>{today}</span><span className="today-dot">·</span><strong>Today only</strong></div>
            </div>

            {/* Mode switcher tabs */}
            <div className="search-mode-tabs" role="tablist" aria-label="Search Mode">
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === "journey"}
                className={`mode-tab-btn ${searchMode === "journey" ? "active" : ""}`}
                onClick={() => setSearchMode("journey")}
              >
                <MapPin size={15} />
                <span>Find by Stops (From → To)</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={searchMode === "route"}
                className={`mode-tab-btn ${searchMode === "route" ? "active" : ""}`}
                onClick={() => setSearchMode("route")}
              >
                <BusFront size={15} />
                <span>Find by Bus Route No.</span>
              </button>
            </div>

            {searchMode === "journey" ? (
              <>
                <form className="journey-form" onSubmit={handleSearch} noValidate>
                  <div className="stops-group">
                    <StopField id="from-stop" label="FROM" value={from} onChange={(value) => { setFrom(value); setErrors((current) => ({ ...current, from: undefined })); }} error={errors.from} />
                    <button
                      className="swap-button"
                      type="button"
                      onClick={() => { setFrom(to); setTo(from); setErrors({}); }}
                      aria-label="Swap origin and destination"
                      title="Swap stops"
                    ><ArrowLeftRight size={18} strokeWidth={2.2} /></button>
                    <StopField id="to-stop" label="TO" value={to} onChange={(value) => { setTo(value); setErrors((current) => ({ ...current, to: undefined })); }} error={errors.to} destination />
                  </div>
                  <div className="time-field">
                    <span className="field-marker time-marker" aria-hidden="true"><Clock3 size={19} strokeWidth={2.2} /></span>
                    <div className="field-content"><label htmlFor="departure-time">LEAVING AFTER</label><input id="departure-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></div>
                    <button className="now-button" type="button" onClick={() => setTime(kolkataTime())}>Now</button>
                  </div>
                  <button className="search-button" type="submit"><Search size={19} strokeWidth={2.3} /><span>Find buses</span><ArrowRight size={18} className="search-arrow" /></button>
                </form>
                <div className="quick-time-row">
                  <span className="quick-time-label"><Clock3 size={13} aria-hidden="true" /> Quick times</span>
                  <div className="quick-time-chips">
                    {quickTimes.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        className={time === option.value ? "selected" : ""}
                        onClick={() => setTime(option.value)}
                        aria-pressed={time === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="popular-row">
                  <span>Popular routes</span>
                  <div className="popular-chips">{POPULAR_JOURNEYS.map((journey) => <button key={`${journey.from}-${journey.to}`} type="button" onClick={() => choosePopular(journey)}>{journey.from}<ArrowRight size={13} />{journey.to}</button>)}</div>
                  <span className="data-hint"><Info size={13} /> Timetable data · not live tracking</span>
                </div>
              </>
            ) : (
              <RouteExplorer onSelectJourney={handleRouteSelectJourney} />
            )}
          </div>
        </section>

        {history.length > 0 && (
          <section className="history-section page-container" aria-labelledby="history-title">
            <div className="history-head">
              <div>
                <div className="section-kicker"><HistoryIcon size={14} /> RECENTLY VIEWED</div>
                <h2 id="history-title">Your last buses<span className="accent-period">.</span></h2>
                <p>Tap any bus to reopen its full details and stops.</p>
              </div>
              <button type="button" className="history-clear" onClick={() => setHistory([])}>Clear history</button>
            </div>
            <div className="history-strip">
              {history.map((entry) => {
                const clock = formatClock(entry.departure);
                return (
                  <button key={entry.key} type="button" className="history-card" onClick={() => openHistoryEntry(entry)}>
                    <span className="history-card-top">
                      <span className={`route-square small ${entry.type === "AC" ? "ac" : ""}`}><BusFront size={17} strokeWidth={2.1} /></span>
                      <strong>{entry.number}</strong>
                      <span className={`type-badge ${entry.type === "AC" ? "ac" : ""}`}>{entry.type}</span>
                      <ArrowUpRight size={14} className="history-arrow" aria-hidden="true" />
                    </span>
                    <span className="history-route">{entry.boarding}<ArrowRight size={11} />{entry.alighting}</span>
                    <span className="history-meta"><Clock3 size={11} aria-hidden="true" /> {clock.time} {clock.period} · viewed {timeAgo(entry.viewedAt)}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="results-section page-container" id="results" aria-labelledby="results-title">
          <div className="results-intro">
            <div><div className="section-kicker"><span className="kicker-dash" /> YOUR JOURNEY, SORTED</div><h2 id="results-title">Buses for your day<span className="accent-period">.</span></h2><p>All the scheduled options for the journey you have in mind.</p></div>
            <div className="schedule-indicator"><span className="schedule-indicator-icon"><CalendarDays size={17} /></span><span><strong>{today}</strong><small>Kolkata local time (IST)</small></span></div>
          </div>

          <div className="journey-banner"><div className="journey-banner-stops"><span className="banner-dot origin" /><strong>{submitted.from}</strong><span className="banner-line"><ArrowRight size={17} /></span><span className="banner-dot destination" /><strong>{submitted.to}</strong></div><span className="journey-banner-count"><BusFront size={16} /> {countLabel}</span><button type="button" className="share-button" onClick={shareJourney}><Share2 size={14} aria-hidden="true" /> {shareStatus === "copied" ? "Link copied" : shareStatus === "failed" ? "Copy failed" : "Share"}</button></div>

          <div className="results-controls">
            <div className="view-tabs" role="tablist" aria-label="Timetable view">
              <button type="button" role="tab" aria-selected={view === "upcoming"} className={view === "upcoming" ? "active" : ""} onClick={() => changeView("upcoming")}>After {selectedClock.time} {selectedClock.period}<span>{upcomingTrips.length}</span></button>
              <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "active" : ""} onClick={() => changeView("all")}>All day<span>{filteredTrips.length}</span></button>
            </div>
            <div className="type-filters" aria-label="Filter by bus type"><span>Show</span>{(["all", "AC", "Non-AC"] as TypeFilter[]).map((type) => <button key={type} type="button" className={typeFilter === type ? "selected" : ""} onClick={() => { setTypeFilter(type); setVisibleCount(6); }} aria-pressed={typeFilter === type}>{type === "all" ? "All buses" : type}</button>)}</div>
          </div>

          <div className="results-layout">
            <div className="results-list" role="tabpanel">
              {visibleTrips.length ? (
                <>
                  {visibleTrips.map((trip, index) => <TripCard key={trip.id} trip={trip} onOpen={() => openTrip(trip)} firstUpcoming={view === "upcoming" && index === 0} />)}
                  {displayedTrips.length > visibleCount && <button type="button" className="show-more" onClick={() => setVisibleCount(displayedTrips.length)}>Show all {displayedTrips.length} departures <ArrowRight size={17} /></button>}
                  <div className="end-note"><span /> You&apos;re all caught up for this view <span /></div>
                </>
              ) : (
                <div className="empty-state">
                  <span className="empty-art"><PersonStanding size={26} aria-hidden="true" /></span>
                  <h3>{allTrips.length === 0 ? (routeLinks.length ? (transferPlans.length ? "No timetable for the direct bus — a timed option with one change is below" : "No timetable is published for the direct bus yet") : transferPlans.length ? "No direct bus — but you can get there with one change" : "No bus connects those stops yet") : view === "upcoming" ? "That's the last bus after this time" : "No buses match this filter"}</h3>
                  <p>{allTrips.length === 0
                    ? (routeLinks.length
                      ? (transferPlans.length ? "The direct bus is listed first and has no published times. Below it are the quickest timed ways with a single change." : "The bus below connects your stops. City buses in Kolkata run to frequency, so no departure times are published for it — and we only show times we can back up. Ask at the stop or check with the operator.")
                      : transferPlans.length ? "Here are the quickest ways with a single change. Tap a bus number for its stops." : "Buses in this preview run between major hubs. Try one of these busy routes instead:")
                    : view === "upcoming"
                      ? "You can still see the full day's timetable, or pick an earlier time below."
                      : "Try selecting All buses to see every service on this route."}</p>
                  {allTrips.length === 0 && <RouteLinks links={routeLinks} noTrips />}
                  {allTrips.length === 0 && transferPlans.length > 0 && (
                    <div className="transfer-list" aria-label="Journeys with one change">
                      {transferPlans.map((plan) => {
                        const start = formatClock(plan.departure);
                        const end = formatClock(plan.arrival);
                        return (
                          <div className="transfer-card" key={plan.id}>
                            <div className="transfer-top">
                              <strong>{start.time} {start.period} <ArrowRight size={13} aria-hidden="true" /> {end.time} {end.period}</strong>
                              <span>{formatDuration(plan.duration)} · 1 change{plan.includesSample ? " · sample times" : ""}</span>
                            </div>
                            <ol className="transfer-legs">
                              <li><button type="button" onClick={() => openTrip(plan.first)}><BusFront size={14} aria-hidden="true" /> Bus {plan.first.number}</button> {plan.first.boarding} <ArrowRight size={12} aria-hidden="true" /> {plan.transferStop}</li>
                              <li className="transfer-wait"><Repeat size={13} aria-hidden="true" /> Change at <strong>{plan.transferStop}</strong> · wait {formatDuration(plan.wait)}</li>
                              <li><button type="button" onClick={() => openTrip(plan.second)}><BusFront size={14} aria-hidden="true" /> Bus {plan.second.number}</button> {plan.transferStop} <ArrowRight size={12} aria-hidden="true" /> {plan.to}</li>
                            </ol>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {allTrips.length === 0
                    ? <div className="empty-choices">{POPULAR_JOURNEYS.map((journey) => (
                        <button key={`empty-${journey.from}-${journey.to}`} type="button" onClick={() => choosePopular(journey)}>{journey.from}<ArrowRight size={12} aria-hidden="true" />{journey.to}</button>
                      ))}</div>
                    : view === "upcoming" && <div className="empty-choices">
                        {firstBusOfDay && view === "upcoming" && typeFilter === "all" && (
                          <button type="button" onClick={() => { setTime("00:00"); commitJourney({ ...submitted, time: "00:00" }); }}><Sunrise size={12} aria-hidden="true" /> Show tomorrow&apos;s first buses</button>
                        )}
                        <button type="button" onClick={() => changeView("all")}>See all-day timetable <ArrowRight size={12} aria-hidden="true" /></button>
                        <button type="button" onClick={() => { const earlier = toClock24(Math.max(0, parseClock(submitted.time) - 60)); setTime(earlier); commitJourney({ ...submitted, time: earlier }); }}><Clock3 size={12} aria-hidden="true" /> Try 1 hour earlier</button>
                      </div>}
                </div>
              )}
              {allTrips.length > 0 && <RouteLinks links={routeLinks} noTrips={false} />}
            </div>
            <aside className="results-sidebar" aria-label="Timetable information">
              <div className="sidebar-tips">
                <div className="sidebar-tips-head"><span className="sidebar-tips-icon"><Lightbulb size={19} aria-hidden="true" /></span><h3>Handy for passengers</h3></div>
                <ul>
                  <li><span className="tip-icon person"><PersonStanding size={15} aria-hidden="true" /></span><p>Reach your stop a few minutes early — buses sometimes leave a little ahead of the listed time.</p></li>
                  <li><span className="tip-icon users"><Users size={15} aria-hidden="true" /></span><p>Peak hours feel crowded. Midday and late-evening buses are usually quieter.</p></li>
                  <li><span className="tip-icon access"><Accessibility size={15} aria-hidden="true" /></span><p>Seats near the front are meant for seniors and passengers with disabilities.</p></li>
                  <li><span className="tip-icon route"><Route size={15} aria-hidden="true" /></span><p>Big hubs such as Esplanade and Sealdah link to most routes in this preview.</p></li>
                </ul>
              </div>
              <div className="sidebar-note" id="about"><span className="sidebar-icon"><Info size={21} /></span><h3>A little heads-up</h3><p>Timetables come from the Kolkata bus directory v2, which publishes a passage time at every stop, plus a small number of long-distance services whose operator publishes stop-by-stop times. <strong>{DATA_COUNTS.catalogueRoutes} more routes</strong> come from the WBTC and Bus-O-Pedia route lists; Kolkata city buses run to frequency, so those have no times at all and are shown as route links. Some routes use <strong>sample frequencies</strong> and are labelled Sample. Times are not live, do not show bus locations, and may differ from official schedules. The <strong>Set on bus</strong> screen is different: it uses your phone&apos;s own GPS to follow your route and works offline, but it still does not track buses.</p><div className="sidebar-divider" /><div className="sidebar-fact"><span><Check size={13} /></span> No account required</div><div className="sidebar-fact"><span><Check size={13} /></span> Today&apos;s timetable view</div><div className="sidebar-fact"><span><Check size={13} /></span> Kolkata and suburban routes</div></div>
              <div className="sidebar-art"><div className="sidebar-art-label">A CITY ALWAYS IN MOTION</div><div className="sidebar-path"><span /><span /><span /></div><h3>Go on, Kolkata is waiting.</h3><p>From your first stop to your last, a little planning goes a long way.</p><Navigation size={24} className="sidebar-navigation" /></div>
            </aside>
          </div>
        </section>

        <section className="how-section page-container" id="how-it-works" aria-labelledby="how-title"><div className="how-heading"><div><div className="section-kicker"><span className="kicker-dash" /> SIMPLE AS 1, 2, 3</div><h2 id="how-title">A smoother way to get there<span className="accent-period">.</span></h2></div><p>Less time figuring out the commute. More time enjoying the journey.</p></div><div className="how-grid">
  <div className="how-card"><span className="how-number">01</span><span className="how-icon"><PersonStanding size={24} /></span><h3>Pick your stops</h3><p>Choose where you&apos;re starting from and where you want to go in Kolkata.</p></div>
  <div className="how-card"><span className="how-number">02</span><span className="how-icon"><Clock3 size={24} /></span><h3>Choose a time</h3><p>Use a quick time or set your own, then see every bus for the rest of the day.</p></div>
  <div className="how-card"><span className="how-number">03</span><span className="how-icon"><BusFront size={24} /></span><h3>Tap your bus</h3><p>Open any bus to see its full route, every stop, and the times along the way.</p></div>
</div></section>
        <section className="ride-promo page-container" aria-labelledby="ride-promo-title"><div className="ride-promo-inner"><span className="ride-promo-icon"><LocateFixed size={26} /></span><div className="ride-promo-copy"><div className="section-kicker"><span className="kicker-dash" /> ON THE BUS, OFFLINE</div><h2 id="ride-promo-title">Set on bus<span className="accent-period">.</span></h2><p>Open any bus and tap <strong>Set on bus</strong>. A full-page route map follows you along it with no signal at all: how far the next stop is, and how long to every stop still ahead. It uses your phone&apos;s own GPS, so it works where a bus is most likely to lose reception — and it tells you plainly if you are not on the route.</p><ul><li><Check size={14} strokeWidth={3} /> Works completely offline</li><li><Check size={14} strokeWidth={3} /> Distances and times to every stop ahead</li><li><Check size={14} strokeWidth={3} /> Says &ldquo;you are not seated in this bus&rdquo; when you are not</li></ul></div><a className="ride-promo-action" href="#search"><span>Find a bus to ride</span><ArrowRight size={17} /></a></div></section>
        <BusDetailModal trip={detailTrip} onClose={() => setDetailTrip(null)} />
        </main>
      </div>

      {showTopButton && (
        <button type="button" className="to-top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <ArrowUp size={17} aria-hidden="true" />
          <span>Top</span>
        </button>
      )}

      {/* <footer className="site-footer"><div className="footer-inner page-container"><div className="footer-brand"><span className="brand-mark"><BusFront size={20} /></span><span><strong>cholo<span>.</span></strong><small>Made for the way Kolkata moves.</small></span></div><p>Sample timetables only. Not live tracking or official travel advice.</p><a href="#top">Back to top <ArrowUpRight size={16} /></a></div></footer> */}
    </div>
  );
}

