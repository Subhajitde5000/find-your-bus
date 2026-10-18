/*
 * End-to-end test of the /ride screen, in a DOM.
 *
 * The engine tests cover the maths. This one covers the wiring: that the "Set on bus"
 * button actually starts the GPS watch, that the fixes the browser delivers move the
 * screen from "ready" to "on bus", that the next stop and the distance appear, and that
 * a passenger who is somewhere else is told they are not seated.
 *
 * It runs in jsdom against the real page component with a mocked Geolocation API, so it
 * catches the class of bug that only appears when React, the DOM and the engine meet —
 * a stale closure over the route, a reset that fires every render, a headline that never
 * updates.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

// Requires, not imports: the DOM has to exist before react-dom is loaded, and the
// next/navigation stub has to be in place before the page module is loaded. Both are
// ordering constraints that ES imports cannot express in this setup.
const Module = require("node:module") as { _load: any };
const { JSDOM } = require("jsdom") as typeof import("jsdom");

/*
 * The ride page is a Next.js client component: it calls useSearchParams() from
 * next/navigation and renders <Link>. Neither works outside a Next app, so both are
 * replaced here — the search params with the query string under test, and Link with a
 * plain anchor. Everything else on the page is the real thing.
 */
interface Watcher {
  onFix: (position: unknown) => void;
  onError: (error: unknown) => void;
}

const captured: { watchers: Watcher[]; cleared: number[] } = { watchers: [], cleared: [] };
let searchQuery = "route=1&dir=outbound";
let nextWatchId = 1;

const originalLoad = Module._load;
Module._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
  // __esModule is what makes the CJS interop hand back `.default` rather than the
  // whole module object; without it `import Link from "next/link"` gets an object.
  if (request === "next/navigation") {
    return {
      __esModule: true,
      useSearchParams: () => new URLSearchParams(searchQuery),
      useRouter: () => ({ push() {}, replace() {}, back() {} }),
      usePathname: () => "/ride",
    };
  }
  if (request === "next/link") {
    const react = originalLoad.call(Module, "react", parent, isMain);
    return {
      __esModule: true,
      default: ({ href, children, ...rest }: any) => react.createElement("a", { href, ...rest }, children),
    };
  }
  return originalLoad.call(Module, request, parent, isMain);
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/ride?route=1&dir=outbound",
  pretendToBeVisual: true,
});
const win: any = dom.window;
const g = globalThis as any;

g.window = win;
g.document = win.document;
g.HTMLElement = win.HTMLElement;
g.Element = win.Element;
g.Node = win.Node;
g.Event = win.Event;
g.MouseEvent = win.MouseEvent;
g.CustomEvent = win.CustomEvent;
g.getComputedStyle = win.getComputedStyle.bind(win);
g.requestAnimationFrame = win.requestAnimationFrame.bind(win);
g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(g, "navigator", { value: win.navigator, configurable: true, writable: true });
// React 19 asks the environment to promise that act() is in use.
g.IS_REACT_ACT_ENVIRONMENT = true;

/** A Geolocation API that records its watchers so the test can drive them. */
function installGeolocation(options?: { fail?: boolean }) {
  const geolocation = {
    watchPosition(onFix: (position: unknown) => void, onError: (error: unknown) => void) {
      if (options?.fail) {
        onError({ code: 1, PERMISSION_DENIED: 1 });
        return nextWatchId++;
      }
      captured.watchers.push({ onFix, onError });
      return nextWatchId++;
    },
    clearWatch(id: number) {
      captured.cleared.push(id);
    },
  };
  Object.defineProperty(win.navigator, "geolocation", { value: geolocation, configurable: true });
}
installGeolocation();

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const RidePage = (require("@/app/ride/page") as { default: React.FC }).default;
const { buildRide, pointAtMetres } = require("@/lib/ride") as typeof import("@/lib/ride");

// --------------------------------------------------------------------------- helpers

interface Mounted {
  container: HTMLElement;
  unmount: () => void;
  text: () => string;
  click: (label: string) => void;
  sendFix: (lat: number, lng: number, seconds: number, accuracy?: number) => void;
}

function mount(query: string): Mounted {
  searchQuery = query;
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);

  const runInAct = (fn: () => void) => {
    React.act(fn);
  };

  runInAct(() => {
    root.render(React.createElement(RidePage));
  });

  return {
    container,
    unmount: () => runInAct(() => root.unmount()),
    text: () => container.textContent ?? "",
    click: (label: string) => {
      const nodes = Array.from(container.querySelectorAll("button, a")) as HTMLElement[];
      const target = nodes.find((node) => (node.textContent ?? "").includes(label));
      assert.ok(target, `no control labelled "${label}". Found: ${nodes.map((n) => n.textContent).join(" | ")}`);
      runInAct(() => {
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    sendFix: (lat, lng, seconds, accuracy = 10) => {
      runInAct(() => {
        for (const watcher of [...captured.watchers]) {
          watcher.onFix({
            coords: { latitude: lat, longitude: lng, accuracy },
            timestamp: 1_700_000_000_000 + seconds * 1000,
          });
        }
      });
    },
  };
}

/**
 * The coordinates of a located stop on a route, read through the same engine the page
 * uses. Placing the passenger at a real stop is the most honest way to test the screen.
 *
 * `which` counts located stops, not stops: route 1's first stop (Ramnagar) is one of the
 * ones no source could place, which is the documented state, not a failure.
 */
function stopCoordinates(routeNumber: string, which = 0) {
  const built = buildRide({ number: routeNumber, direction: "outbound" });
  if (!built.ok) assert.fail(`route ${routeNumber} should build`);
  const located = built.ride.stops.filter((stop) => stop.position);
  assert.ok(located.length > which, `route ${routeNumber} has ${located.length} located stops, wanted #${which}`);
  return located[which].position as { lat: number; lng: number };
}

/** A point a fraction of the way along a route's corridor. */
function pointAlong(routeNumber: string, ratio: number) {
  const built = buildRide({ number: routeNumber, direction: "outbound" });
  if (!built.ok) assert.fail(`route ${routeNumber} should build`);
  const point = pointAtMetres(built.ride, built.ride.totalMetres * ratio);
  if (!point) assert.fail(`route ${routeNumber} has no corridor`);
  return point;
}

/** Three fixes one second apart: the minimum the tracker needs to commit. */
function settle(page: Mounted, point: { lat: number; lng: number }, from = 0) {
  page.sendFix(point.lat, point.lng, from);
  page.sendFix(point.lat, point.lng, from + 1);
  page.sendFix(point.lat, point.lng, from + 2);
}

// --------------------------------------------------------------------------- tests

describe("the /ride page, in a DOM", () => {
  before(() => {
    captured.watchers.length = 0;
  });

  after(() => {
    Module._load = originalLoad;
  });

  it("renders the route and waits for the passenger to start", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      assert.ok(page.text().includes("Bus 1"), page.text().slice(0, 200));
      assert.ok(page.text().includes("Ready when you are"));
      assert.ok(page.text().includes("Set on bus"));
      assert.equal(captured.watchers.length, 0, "nothing is watched until the button is pressed");
      // The stop list and the timetable are there before any GPS is used.
      assert.ok(page.container.querySelector(".ride-stoplist"));
      assert.ok(page.text().includes("Offline") || page.text().includes("Online"));
      assert.ok(page.text().includes("How this works"), "and the caveats are shown");
    } finally {
      page.unmount();
    }
  });

  it("starts the GPS watch when the passenger taps Set on bus", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      assert.equal(captured.watchers.length, 1, "one watch, not one per render");
      assert.ok(page.text().includes("Finding you"), "a single reading is not a position yet");
    } finally {
      page.unmount();
    }
  });

  it("says 'on the bus' once the fixes land on the route", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      settle(page, stopCoordinates("1"));
      assert.ok(page.text().includes("On bus 1"), page.text().slice(0, 400));
      assert.ok(page.text().includes("You are here"), "the passenger's stop is marked");
      assert.ok(page.text().includes("Next stop"), "and the next one is named");
      assert.match(page.text(), /\d+(\.\d+)? (m|km)/, "the page shows a real distance");
      assert.equal(page.container.querySelectorAll(".ride-stop.current").length, 1, "exactly one 'here'");

      // The drawn map: the route as a line, with the passenger's marker on it.
      assert.equal(page.container.querySelectorAll(".ride-map-svg").length, 1, "the map is drawn");
      assert.equal(page.container.querySelectorAll(".ride-map-marker").length, 1, "the bus is on the map");
      assert.ok(page.container.querySelectorAll(".ride-map-stop").length >= 2, "and so are the stops");
      assert.ok(page.container.querySelector(".ride-map-done"), "the travelled part is drawn");
    } finally {
      page.unmount();
    }
  });

  it("names a next stop that is ahead, and gives a distance to it", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      for (let second = 0; second <= 4; second += 1) {
        page.sendFix(...(([p]) => [p.lat, p.lng, second] as [number, number, number])([pointAlong("1", 0.05 + second * 0.01)]));
      }
      assert.ok(page.text().includes("On bus 1"));
      const card = page.container.querySelectorAll(".ride-card")[1];
      assert.ok(card, "the next-stop card exists");
      assert.match(card.textContent ?? "", /ahead/, `next-stop card read: ${card.textContent}`);
      assert.match(card.textContent ?? "", /\d+(\.\d+)? (m|km)/, `next-stop card read: ${card.textContent}`);
    } finally {
      page.unmount();
    }
  });

  it("says the passenger is not seated when they are somewhere else", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      const first = stopCoordinates("1");
      // Three kilometres east of the route is not on the route.
      const away = { lat: first.lat, lng: first.lng + 3 / (111.194 * Math.cos((first.lat * Math.PI) / 180)) };
      settle(page, away);
      assert.ok(page.text().includes("You are not seated in this bus"), page.text().slice(0, 400));
      assert.match(page.text(), /nearest stop/i, "and it names the nearest stop");
      assert.equal(page.container.querySelectorAll(".ride-stop.current").length, 0, "no 'here' marker");
      // The map still shows the route, so the passenger can see where the bus should be.
      assert.equal(page.container.querySelectorAll(".ride-map-svg").length, 1);
      assert.equal(page.container.querySelectorAll(".ride-map-marker").length, 0, "but no bus on it");
    } finally {
      page.unmount();
    }
  });

  it("keeps showing the timetable while the passenger is not on the bus", () => {
    captured.watchers.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      const first = stopCoordinates("1");
      const away = { lat: first.lat, lng: first.lng + 3 / (111.194 * Math.cos((first.lat * Math.PI) / 180)) };
      settle(page, away);
      assert.ok(page.container.querySelector(".ride-stoplist"));
      assert.ok(page.container.querySelector(".ride-list-note"), "the list explains itself");
      assert.ok(page.text().includes("scheduled"), "the times are labelled as scheduled");
    } finally {
      page.unmount();
    }
  });

  it("ends the ride and stops the watch", () => {
    captured.watchers.length = 0;
    captured.cleared.length = 0;
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      settle(page, stopCoordinates("1"));
      assert.ok(page.text().includes("On bus 1"));
      page.click("End ride");
      assert.equal(captured.cleared.length, 1, "the GPS watch is released");
      assert.ok(page.text().includes("Ride ended"));
      assert.ok(page.text().includes("Try again"), "and it can be restarted");
    } finally {
      page.unmount();
    }
  });

  it("switches direction, and the route header follows", () => {
    captured.watchers.length = 0;
    const page = mount("route=230&dir=outbound");
    try {
      assert.ok(page.text().includes("Bus 230"));
      const built = buildRide({ number: "230", direction: "outbound" });
      if (!built.ok) assert.fail("route 230 should build");
      assert.ok(page.text().includes(built.ride.origin), `expected ${built.ride.origin}`);
      page.click("Travelling towards");
      const back = buildRide({ number: "230", direction: "return" });
      if (!back.ok) assert.fail("route 230 return should build");
      assert.ok(page.text().includes(back.ride.origin), `after switching, expected ${back.ride.origin}`);
      assert.ok(page.container.querySelector(".ride-stoplist"), "the list redrew");
    } finally {
      page.unmount();
    }
  });

  it("offers no ride screen for a route that is not in the directory", () => {
    const page = mount("route=NOT-A-ROUTE&dir=outbound");
    try {
      assert.ok(page.text().includes("not in this directory"), page.text().slice(0, 300));
      assert.ok(page.text().includes("Back to the timetable"));
    } finally {
      page.unmount();
    }
  });

  it("reports a denied location permission without breaking the page", () => {
    installGeolocation({ fail: true });
    const page = mount("route=1&dir=outbound");
    try {
      page.click("Set on bus");
      assert.ok(page.text().includes("Location is blocked"), page.text().slice(0, 300));
      assert.ok(page.container.querySelector(".ride-stoplist"), "the timetable stays usable");
    } finally {
      page.unmount();
      installGeolocation();
    }
  });

  it("carries the run through from the timetable link", () => {
    const page = mount("route=1&dir=outbound&run=RUN-1-OUT-01");
    try {
      assert.ok(page.text().includes("Bus 1"));
      assert.ok(page.text().includes("RUN-1-OUT-01"), "the run the passenger chose is named");
    } finally {
      page.unmount();
    }
  });
});
