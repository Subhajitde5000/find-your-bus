/*
 * The stop map and the ride map's new tools, in a DOM: tap a stop for its buses, search a
 * stop, find the nearest stop, switch day/night, toggle roads and landmarks.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const Module = require("node:module") as { _load: any };
const { JSDOM } = require("jsdom") as typeof import("jsdom");

const originalLoad = Module._load;
Module._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/link") {
    const react = originalLoad.call(Module, "react", parent, isMain);
    return { __esModule: true, default: ({ href, children, ...rest }: any) => react.createElement("a", { href, ...rest }, children) };
  }
  return originalLoad.call(Module, request, parent, isMain);
};

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/map", pretendToBeVisual: true });
const win: any = dom.window;
const g = globalThis as any;
for (const name of ["document", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "MutationObserver"]) g[name === "document" ? "document" : name] = win[name];
g.window = win;
g.getComputedStyle = win.getComputedStyle.bind(win);
g.requestAnimationFrame = win.requestAnimationFrame.bind(win);
g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(g, "navigator", { value: win.navigator, configurable: true, writable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout or matchMedia; the map must cope with that.
win.matchMedia = undefined;

let geoResult: { lat: number; lng: number; accuracy: number } | { error: number } = { lat: 22.5726, lng: 88.3639, accuracy: 20 };
Object.defineProperty(win.navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition(ok: (p: unknown) => void, fail: (e: unknown) => void) {
      if ("error" in geoResult) fail({ code: geoResult.error, PERMISSION_DENIED: 1 });
      else ok({ coords: { latitude: geoResult.lat, longitude: geoResult.lng, accuracy: geoResult.accuracy }, timestamp: Date.now() });
    },
    watchPosition() { return 1; },
    clearWatch() {},
  },
});

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const { NetworkMap } = require("@/components/NetworkMap") as typeof import("@/components/NetworkMap");
const { RideRouteMap } = require("@/components/RideRouteMap") as typeof import("@/components/RideRouteMap");
const { StopBusesPanel } = require("@/components/StopBusesPanel") as typeof import("@/components/StopBusesPanel");
const { buildRide } = require("@/lib/ride") as typeof import("@/lib/ride");
const { STOP_INDEX, nearestStops } = require("@/lib/stopIndex") as typeof import("@/lib/stopIndex");

function mount(element: React.ReactElement) {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  React.act(() => root.render(element));
  const act = (fn: () => void) => React.act(fn);
  const click = (el: Element | null | undefined) => {
    assert.ok(el, "element to click exists");
    act(() => void el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })));
  };
  const clickLabel = (label: string) => {
    const el = (Array.from(container.querySelectorAll("button, a")) as Element[]).find((n) => (n.textContent ?? "").includes(label) || n.getAttribute("aria-label")?.includes(label));
    assert.ok(el, `no control "${label}"`);
    click(el);
  };
  const type = (selector: string, value: string) => {
    const input = container.querySelector(selector) as HTMLInputElement | null;
    assert.ok(input, `no ${selector}`);
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new win.Event("input", { bubbles: true }));
    });
  };
  return { container, click, clickLabel, type, text: () => container.textContent ?? "", unmount: () => act(() => root.unmount()) };
}

/** A stop in the middle of the city with several buses, so the tests do not depend on one name. */
const busy = STOP_INDEX.located.filter((s) => s.buses.length >= 3 && s.position!.lat > 22.5 && s.position!.lat < 22.65).sort((a, b) => b.buses.length - a.buses.length)[0];

describe("the stop map", () => {
  it("draws every stop in the city window, with roads and a day style at first", () => {
    const map = mount(React.createElement(NetworkMap));
    try {
      const svg = map.container.querySelector(".net-map-svg");
      assert.ok(svg);
      assert.ok(map.container.querySelectorAll("circle.net-map-stop").length > 500);
      assert.equal(map.container.querySelector(".net-map")!.getAttribute("data-map-style"), "day");
      assert.match(map.text(), /have no published position yet and are left off rather than guessed/);
    } finally { map.unmount(); }
  });

  it("opens the list of buses when a stop is tapped, and closes it again", () => {
    const map = mount(React.createElement(NetworkMap));
    try {
      const stops = (Array.from(map.container.querySelectorAll("g")) as Element[]).filter((n) => n.querySelector(":scope > circle.net-map-stop"));
      const target = stops.find((n) => ((n as Element).querySelector("title")?.textContent ?? "").startsWith(busy.name + " ·"));
      assert.ok(target, "the busy stop is drawn");
      map.click(target as Element);
      const panel = map.container.querySelector(".stop-buses");
      assert.ok(panel, "the panel opens");
      assert.ok(panel.textContent!.includes(busy.name));
      assert.equal(panel.querySelectorAll("li").length, Math.min(10, busy.buses.length));
      const link = panel.querySelector("a[href^='/ride?']") as HTMLAnchorElement;
      assert.ok(link, "each bus links to the ride screen");
      assert.match(link.getAttribute("href")!, /route=.+&dir=outbound&from=/);
      map.clickLabel("Close this list");
      assert.equal(map.container.querySelector(".stop-buses"), null);
    } finally { map.unmount(); }
  });

  it("draws a bus's route when asked, and says how much of it follows a road", () => {
    const map = mount(React.createElement(NetworkMap));
    try {
      map.type(".stop-search input", busy.name.slice(0, 6));
      const first = map.container.querySelector(".stop-search-results button");
      assert.ok(first, "the search offers matches");
      map.click(first);
      assert.ok(map.container.querySelector(".stop-buses"));
      map.clickLabel("Show route");
      assert.ok(map.container.querySelector(".net-map-route"), "the route line is drawn");
      assert.match(map.text(), /Route .+: \d+ legs? follow a road shape/);
    } finally { map.unmount(); }
  });

  it("searches by name, ignoring case, and says so when nothing matches", () => {
    const map = mount(React.createElement(NetworkMap));
    try {
      map.type(".stop-search input", busy.name.toUpperCase());
      assert.ok(map.container.querySelectorAll(".stop-search-results li").length >= 1);
      map.type(".stop-search input", "zzzzqqqq");
      assert.match(map.container.querySelector(".stop-search-results")!.textContent!, /No stop with that name/);
    } finally { map.unmount(); }
  });

  it("finds the nearest stop, highlights it and lists the others", () => {
    geoResult = { lat: busy.position!.lat + 0.0004, lng: busy.position!.lng, accuracy: 15 };
    const expected = nearestStops(STOP_INDEX, geoResult, { limit: 5, maxMetres: 3000 });
    const map = mount(React.createElement(NetworkMap));
    try {
      map.clickLabel("Nearest stop to me");
      assert.equal(map.container.querySelectorAll("circle.net-map-stop.nearest").length, 1);
      assert.ok(map.container.querySelector(".net-map-nearest-ring"));
      assert.ok(map.container.querySelector(".net-map-user-dot"));
      const rows = map.container.querySelectorAll(".net-near li");
      assert.equal(rows.length, expected.length);
      assert.ok(rows[0].textContent!.includes(expected[0].stop.name));
      assert.ok(map.container.querySelector(".stop-buses"), "its buses are shown straight away");
    } finally { map.unmount(); }
  });

  it("says plainly when the phone is far from every mapped stop", () => {
    geoResult = { lat: 26.7, lng: 88.4, accuracy: 30 };
    const map = mount(React.createElement(NetworkMap));
    try {
      map.clickLabel("Nearest stop to me");
      assert.match(map.text(), /outside the Kolkata map area/);
      assert.equal(map.container.querySelectorAll(".net-near").length, 0);
    } finally { map.unmount(); }
  });

  it("explains a blocked location instead of failing", () => {
    geoResult = { error: 1 };
    const map = mount(React.createElement(NetworkMap));
    try {
      map.clickLabel("Nearest stop to me");
      assert.match(map.text(), /Location is blocked/);
      assert.ok(map.container.querySelector(".stop-search input"), "search still works");
    } finally { map.unmount(); geoResult = { lat: 22.5726, lng: 88.3639, accuracy: 20 }; }
  });

  it("cycles the map style and remembers it", () => {
    win.localStorage.clear();
    const map = mount(React.createElement(NetworkMap));
    try {
      const style = () => map.container.querySelector(".net-map")!.getAttribute("data-map-style");
      map.clickLabel("Map style");
      assert.equal(win.localStorage.getItem("pathsathi-map-style"), "day");
      map.clickLabel("Map style");
      assert.equal(style(), "night");
      assert.equal(win.localStorage.getItem("pathsathi-map-style"), "night");
    } finally { map.unmount(); }
    const again = mount(React.createElement(NetworkMap));
    try {
      assert.equal(again.container.querySelector(".net-map")!.getAttribute("data-map-style"), "night", "the choice survives a reload");
    } finally { again.unmount(); win.localStorage.clear(); }
  });

  it("switches roads and landmarks off and on", () => {
    const map = mount(React.createElement(NetworkMap));
    try {
      assert.ok(map.container.querySelector(".landmark-layer"), "landmarks are on by default");
      map.clickLabel("Landmarks");
      assert.equal(map.container.querySelector(".landmark-layer"), null);
      const hadRoads = map.container.querySelector(".net-map-roads") !== null;
      if (hadRoads) {
        map.clickLabel("Roads");
        assert.equal(map.container.querySelector(".net-map-roads"), null);
      }
    } finally { map.unmount(); }
  });
});

describe("the ride map's new tools", () => {
  const built = buildRide({ number: "1", direction: "outbound" });
  if (!built.ok) throw new Error("route 1 should build");
  const ride = built.ride;
  const props = { ride, metresAlong: null, onBus: false, currentStop: null, destinationIndex: ride.stops.length - 1, nextStopIndex: null, passed: new Set<number>() };
  const located = ride.stops.filter((s) => s.position);

  it("opens the buses at a tapped stop, with this route marked", () => {
    const map = mount(React.createElement(RideRouteMap, props));
    try {
      const hit = map.container.querySelectorAll("circle.ride-map-hit")[1];
      map.click(hit);
      const panel = map.container.querySelector(".stop-buses");
      assert.ok(panel);
      assert.ok(panel.querySelector("li.current"), "the bus being ridden is marked");
    } finally { map.unmount(); }
  });

  it("finds a stop of this route by name", () => {
    const map = mount(React.createElement(RideRouteMap, props));
    try {
      map.type(".stop-search input", located[1].name.slice(0, 5));
      const options = Array.from(map.container.querySelectorAll(".stop-search-results button")).map((b) => (b as Element).textContent ?? "");
      assert.ok(options.length > 0);
      assert.ok(options.every((text) => text.length > 0));
      map.click(map.container.querySelector(".stop-search-results button"));
      assert.ok(map.container.querySelector(".stop-buses"));
    } finally { map.unmount(); }
  });

  it("highlights the nearest stop of the route before boarding, and says how far", () => {
    const here = { lat: located[1].position!.lat + 0.0003, lng: located[1].position!.lng };
    const map = mount(React.createElement(RideRouteMap, { ...props, userPosition: here }));
    try {
      assert.ok(map.container.querySelector(".ride-map-nearest"));
      assert.ok(map.container.querySelector(".ride-map-you"));
      assert.match(map.text(), /Nearest stop to you on this route:/);
    } finally { map.unmount(); }
  });

  it("names no nearest stop when the phone is far from the route", () => {
    const map = mount(React.createElement(RideRouteMap, { ...props, userPosition: { lat: 26.7, lng: 88.4 } }));
    try {
      assert.equal(map.container.querySelector(".ride-map-nearest"), null);
      assert.doesNotMatch(map.text(), /Nearest stop to you/);
    } finally { map.unmount(); }
  });

  it("offers landmarks and a night style", () => {
    win.localStorage.clear();
    const map = mount(React.createElement(RideRouteMap, props));
    try {
      assert.equal(map.container.querySelector(".landmark-layer"), null, "off until asked for");
      map.clickLabel("Landmarks");
      assert.ok(map.container.querySelector(".landmark-layer"));
      map.clickLabel("Map style");
      map.clickLabel("Map style");
      assert.equal(map.container.querySelector("figure")!.getAttribute("data-map-style"), "night");
    } finally { map.unmount(); win.localStorage.clear(); }
  });
});

describe("the buses panel", () => {
  it("says so for a stop no bus calls at, and keeps the long list short until asked", () => {
    const empty = mount(React.createElement(StopBusesPanel, { stopName: "No such stop", onClose() {} }));
    try { assert.match(empty.text(), /No bus in this directory calls here/); } finally { empty.unmount(); }
    const many = STOP_INDEX.stops.sort((a, b) => b.buses.length - a.buses.length)[0];
    const panel = mount(React.createElement(StopBusesPanel, { stopName: many.name, onClose() {} }));
    try {
      assert.equal(panel.container.querySelectorAll("li").length, 10);
      panel.clickLabel(`Show all ${many.buses.length}`);
      assert.equal(panel.container.querySelectorAll("li").length, many.buses.length);
    } finally { panel.unmount(); }
  });
});

after(() => { Module._load = originalLoad; });
