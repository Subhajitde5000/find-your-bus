/*
 * Render tests for the ride screen's presentational parts.
 *
 * These exist because the rest of the suite tests the engine, not what the passenger
 * sees. Rendering the components against real data catches the class of bug that only
 * shows up in a browser: a crash on a stop with no position, a missing "no time"
 * branch, a distance that formats as "NaN km".
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RideProgress, RideStopList } from "@/components/RideMap";
import { SiteSidebar } from "@/components/SiteSidebar";
import { isNativeApp, NATIVE_BOOTSTRAP } from "@/lib/native";
import { buildRide, matchRide, pointAtMetres, rideLegs, type RideRoute } from "@/lib/ride";
import { stopPosition } from "@/lib/coords";
import { formatDistance, formatRideMinutes } from "@/lib/geo";
import { formatClock } from "@/lib/timetables";

function rideOrFail(number: string): RideRoute {
  const result = buildRide({ number, direction: "outbound" });
  if (!result.ok) assert.fail(`route ${number} should build: ${result.failure.message}`);
  return result.ride;
}

function renderLegs(ride: RideRoute, metresAlong: number | null) {
  const point = metresAlong === null ? null : pointAtMetres(ride, metresAlong);
  const match = point ? matchRide(ride, point) : null;
  const onBus = match?.state === "on-bus";
  const legs = rideLegs(ride, onBus ? match : null, {
    nowMinutes: 600,
    destinationIndex: ride.stops.length - 1,
    nextStopIndex: match?.nextStopIndex ?? null,
  });
  return {
    onBus,
    legs,
    html: renderToStaticMarkup(
      <RideStopList ride={ride} legs={legs} currentStop={match?.stopIndex ?? null} onBus={onBus} />,
    ),
  };
}

describe("ride screen components render", () => {
  const ride = rideOrFail("1");

  it("renders every stop of a real route", () => {
    const { html } = renderLegs(ride, null);
    for (const stop of ride.stops) {
      assert.ok(html.includes(escapeHtml(stop.name)), `missing stop ${stop.name}`);
    }
    assert.ok(html.includes("ride-stoplist"));
  });

  it("renders with a position on the bus", () => {
    const { html, onBus, legs } = renderLegs(ride, 100);
    assert.equal(onBus, true);
    assert.ok(html.includes("ride-stop current"), "the passenger's stop is marked");
    assert.ok(html.includes("You are here"));
    assert.ok(html.includes("Next stop"));
    assert.ok(legs.some((leg) => leg.isNext), "one stop is the next one");
  });

  it("renders with no position at all, before the first fix", () => {
    const { html, onBus } = renderLegs(ride, null);
    assert.equal(onBus, false);
    assert.ok(!html.includes("You are here"), "no position, no marker");
    // Every stop still shows, with a time where the timetable has one.
    for (const stop of ride.stops) assert.ok(html.includes(escapeHtml(stop.name)));
  });

  it("shows scheduled times, labelled as such, while the passenger is not on the bus", () => {
    const { html, legs } = renderLegs(ride, null);
    assert.ok(legs.some((leg) => leg.scheduled), "the timetable is shown, not invented");
    assert.ok(html.includes("scheduled"), "and it says the times are scheduled");
    assert.ok(html.includes("ride-list-note"), "with a note explaining why there is no countdown");
    // But it must not claim to be measuring from the passenger.
    for (const leg of legs) {
      assert.equal(leg.minutesFromHere, null, `${leg.name} has no countdown without a position`);
      assert.equal(leg.metresFromHere, null, `${leg.name} has no distance without a position`);
    }
  });

  it("drops the scheduled label once the passenger is matched", () => {
    const { legs } = renderLegs(ride, 200);
    assert.ok(legs.every((leg) => !leg.scheduled), "a matched position gives real ETAs");
    assert.ok(legs.some((leg) => leg.minutesFromHere !== null));
  });

  it("marks a stop with no position, and never prints a distance for it", () => {
    const located = ride.stops.filter((stop) => stop.position).length;
    if (located === ride.stops.length) {
      // Every stop on this route is mapped, so check the branch on a route that is not.
      const other = rideOrFail("RADHARANI");
      const { html } = renderLegs(other, null);
      assert.ok(html.includes("no position"), "route RADHARANI has unmapped stops");
      assert.ok(html.includes("ride-coverage"), "and it says so at the foot of the list");
    } else {
      const { html } = renderLegs(ride, null);
      assert.ok(html.includes("no position"));
    }
  });

  it("renders every rideable route in the directory without crashing", () => {
    // A route with unmapped stops, a route with no times, a long intercity route: all
    // of them go through the same component, so all of them are rendered here.
    for (const number of ["1", "12C", "230", "RADHARANI", "S12E", "C23"]) {
      const target = rideOrFail(number);
      const { html } = renderLegs(target, target.totalMetres / 2);
      assert.ok(html.includes("ride-stoplist"), `${number} rendered`);
      assert.ok(!html.includes("NaN"), `${number} must not print NaN`);
      assert.ok(!html.includes("undefined"), `${number} must not print undefined`);
      assert.ok(!html.includes("Infinity"), `${number} must not print Infinity`);
    }
  });

  it("shows an estimated label only where the time really is estimated", () => {
    const noTimes = ["S12E", "C23", "1"].find((number) => {
      const target = rideOrFail(number);
      return target.stops.every((stop) => stop.minutes === null);
    });
    if (!noTimes) return; // every candidate has published times
    const target = rideOrFail(noTimes);
    const { html } = renderLegs(target, 0);
    assert.ok(html.includes("estimate from distance"), `${noTimes} has no published times`);
  });

  it("renders the progress bar at both ends of the route", () => {
    const start = renderToStaticMarkup(<RideProgress ride={ride} metresAlong={0} onBus />);
    const end = renderToStaticMarkup(<RideProgress ride={ride} metresAlong={ride.totalMetres} onBus />);
    assert.ok(start.includes("0.0%"), "starts at 0%");
    assert.ok(end.includes("100.0%"), "ends at 100%");
    assert.ok(start.includes(escapeHtml(ride.origin)));
    assert.ok(start.includes(escapeHtml(ride.destination)));
  });

  it("renders the progress bar before the first fix", () => {
    const html = renderToStaticMarkup(<RideProgress ride={ride} metresAlong={null} onBus={false} />);
    assert.ok(html.includes("0.0%"));
    assert.ok(!html.includes("ride-progress-bus on"), "the bus marker is not on until it is matched");
  });
});

describe("passenger-facing formatting", () => {
  it("never prints a raw number where a distance belongs", () => {
    // 950 m is "1.0 km", never "0.9 km": 0.95 is not exact and rounds the wrong way.
    assert.equal(formatDistance(940), "940 m");
    assert.equal(formatDistance(950), "1.0 km");
    assert.equal(formatDistance(999), "1.0 km");
    assert.equal(formatDistance(1500), "1.5 km");
    assert.equal(formatDistance(12_400), "12.4 km");
    assert.equal(formatDistance(0), "0 m");
    for (const metres of [0, 37, 480, 999, 1500, 12_000]) {
      const text = formatDistance(metres);
      assert.ok(!text.includes("NaN"), `${metres} -> ${text}`);
      assert.ok(text.endsWith(" m") || text.endsWith(" km"), `${metres} -> ${text}`);
    }
  });

  it("rounds ride times up to a whole minute, never to zero", () => {
    assert.equal(formatRideMinutes(0), "1 min");
    assert.equal(formatRideMinutes(0.2), "1 min");
    assert.equal(formatRideMinutes(7.6), "8 min");
    assert.equal(formatRideMinutes(60), "1 hr");
    assert.equal(formatRideMinutes(95), "1 hr 35 min");
    assert.equal(formatRideMinutes(Number.NaN), "—");
  });

  it("keeps the ETAs in Kolkata's own timeline", () => {
    assert.deepEqual(formatClock(0), { time: "12:00", period: "AM" });
    assert.deepEqual(formatClock(600), { time: "10:00", period: "AM" });
    assert.deepEqual(formatClock(1439), { time: "11:59", period: "PM" });
    // A ride that runs past midnight wraps for display, it does not break.
    assert.deepEqual(formatClock(1440 + 90), { time: "01:30", period: "AM" });
  });

  it("finds a position for the stop the ride screen starts from", () => {
    // The home page's "Set on bus" is hidden when fewer than two stops are mapped, so
    // the routes the button offers are exactly the ones that can be followed.
    const ride = rideOrFail("1");
    const mapped = ride.stops.filter((stop) => stopPosition(stop.name)).length;
    assert.ok(mapped >= 2, "the button's own precondition");
    assert.equal(mapped, ride.locatedStops);
  });
});

describe("website vs mobile app navigation and native detection", () => {
  it("keeps How it works and About links on the website, and omits them in the mobile app", () => {
    const webHtml = renderToStaticMarkup(
      <SiteSidebar isOpen={false} onClose={() => {}} searchMode="journey" onSetSearchMode={() => {}} isMobileApp={false} />,
    );
    assert.ok(webHtml.includes("How it works"));
    assert.ok(webHtml.includes("About the data"));
    assert.ok(webHtml.includes("How the data works"));

    const mobileHtml = renderToStaticMarkup(
      <SiteSidebar isOpen={false} onClose={() => {}} searchMode="journey" onSetSearchMode={() => {}} isMobileApp={true} />,
    );
    assert.ok(!mobileHtml.includes("How it works"));
    assert.ok(!mobileHtml.includes("About the data"));
    assert.ok(!mobileHtml.includes("How the data works"));
    assert.ok(mobileHtml.includes("Find a bus"));
    assert.ok(mobileHtml.includes("All bus stops"));
  });

  it("detects Capacitor native platform and CholoNativeBars in isNativeApp() and NATIVE_BOOTSTRAP", () => {
    assert.ok(NATIVE_BOOTSTRAP.includes("dataset.native"));
    assert.ok(NATIVE_BOOTSTRAP.includes("CholoNativeBars"));
    const prevWindow = (globalThis as { window?: unknown }).window;
    try {
      (globalThis as { window?: unknown }).window = {
        Capacitor: { isNativePlatform: () => true },
      };
      assert.equal(isNativeApp(), true);
      (globalThis as { window?: unknown }).window = {
        CholoNativeBars: { setDarkTheme: () => {} },
      };
      assert.equal(isNativeApp(), true);
      (globalThis as { window?: unknown }).window = {};
      assert.equal(isNativeApp(), false);
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
    }
  });
});

/** React escapes text in HTML; the assertions above compare escaped output. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
