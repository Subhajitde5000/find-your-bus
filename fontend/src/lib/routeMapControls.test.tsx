/*
 * The map's zoom, "show the whole route" and "follow my bus" controls, in a DOM.
 *
 * mapView.test.ts covers the maths. This covers the wiring: that the buttons change what the
 * SVG shows, that follow is only offered once the passenger is on the bus, and that a new
 * route starts fitted. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Requires, not imports: the DOM has to exist before react-dom is loaded.
const { JSDOM } = require("jsdom") as typeof import("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
const win: any = dom.window;
const g = globalThis as any;
g.window = win;
g.document = win.document;
g.HTMLElement = win.HTMLElement;
g.Element = win.Element;
g.Node = win.Node;
g.Event = win.Event;
g.MouseEvent = win.MouseEvent;
g.getComputedStyle = win.getComputedStyle.bind(win);
g.requestAnimationFrame = win.requestAnimationFrame.bind(win);
g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(g, "navigator", { value: win.navigator, configurable: true, writable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const { RideRouteMap } = require("@/components/RideRouteMap") as typeof import("@/components/RideRouteMap");
const { buildRide, matchRide, pointAtMetres } = require("@/lib/ride") as typeof import("@/lib/ride");

function ride(number = "1", direction: "outbound" | "return" = "outbound") {
  const result = buildRide({ number, direction });
  assert.ok(result.ok, `route ${number} should build`);
  return result.ride;
}

function mount(rideValue: ReturnType<typeof ride>, onBusAt: number | null) {
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const render = (value: ReturnType<typeof ride>, at: number | null) => {
    const point = at === null ? null : pointAtMetres(value, at);
    const match = point ? matchRide(value, point) : null;
    React.act(() => {
      root.render(
        React.createElement(RideRouteMap, {
          ride: value,
          metresAlong: at,
          onBus: at !== null,
          currentStop: at !== null && match ? match.stopIndex : null,
          destinationIndex: value.stops.length - 1,
          nextStopIndex: at !== null ? (match?.nextStopIndex ?? null) : null,
          passed: new Set<number>(),
        }),
      );
    });
  };
  render(rideValue, onBusAt);
  const button = (label: string) => {
    const el = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
    assert.ok(el, `no button "${label}"`);
    return el;
  };
  const click = (label: string) =>
    React.act(() => {
      button(label).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  const viewBox = () => (container.querySelector("svg.ride-map-svg") as SVGElement).getAttribute("viewBox")!;
  const width = () => Number(viewBox().split(" ")[2]);
  return { container, render, button, click, viewBox, width, unmount: () => React.act(() => root.unmount()) };
}

describe("map controls", () => {
  it("starts showing the whole route, with nothing to zoom out or reset", () => {
    const map = mount(ride(), null);
    assert.equal(map.button("Zoom out").disabled, true);
    assert.equal(map.button("Show the whole route").disabled, true);
    assert.equal(map.button("Zoom in").disabled, false);
    map.unmount();
  });

  it("zooms in and out, and shows the whole route again", () => {
    const map = mount(ride(), null);
    const full = map.width();
    map.click("Zoom in");
    const zoomed = map.width();
    assert.ok(zoomed < full * 0.7, `${zoomed} should be narrower than ${full}`);
    assert.equal(map.button("Zoom out").disabled, false);
    map.click("Zoom in");
    assert.ok(map.width() < zoomed);
    map.click("Show the whole route");
    assert.equal(map.width(), full);
    assert.equal(map.button("Zoom out").disabled, true);
    map.unmount();
  });

  it("zooming out never shows more than the whole route", () => {
    const map = mount(ride(), null);
    const full = map.width();
    map.click("Zoom in");
    map.click("Zoom out");
    map.click("Zoom out");
    assert.equal(map.width(), full);
    map.unmount();
  });

  it("offers follow only once the passenger is on the bus", () => {
    const r = ride();
    const map = mount(r, null);
    assert.equal(map.button("Follow my bus").disabled, true);
    map.render(r, r.totalMetres * 0.4);
    assert.equal(map.button("Follow my bus").disabled, false);
    map.unmount();
  });

  it("follow zooms in on the bus and keeps it centred as it moves", () => {
    const r = ride();
    const map = mount(r, r.totalMetres * 0.3);
    const full = map.width();
    map.click("Follow my bus");
    assert.equal(map.button("Follow my bus").getAttribute("aria-pressed"), "true");
    assert.ok(map.width() < full / 3, "follow should zoom in");
    const centreOf = () => {
      const [x, y, w, h] = map.viewBox().split(" ").map(Number);
      return { x: x + w / 2, y: y + h / 2 };
    };
    const markerOf = () => {
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(map.container.querySelector(".ride-map-marker")!.getAttribute("transform")!)!;
      return { x: Number(m[1]), y: Number(m[2]) };
    };
    let centred = 0;
    for (const share of [0.3, 0.5, 0.7]) {
      map.render(r, r.totalMetres * share);
      const [x, y, w, h] = map.viewBox().split(" ").map(Number);
      const m = markerOf();
      // The bus is always inside the view. Away from the edge of the drawing it is at the centre.
      assert.ok(m.x >= x && m.x <= x + w && m.y >= y && m.y <= y + h, `bus ${JSON.stringify(m)} outside view ${map.viewBox()}`);
      const c = centreOf();
      const clamped = x <= 0.05 || y <= 0.05 || x + w >= full - 0.05;
      if (!clamped) {
        assert.ok(Math.hypot(c.x - m.x, c.y - m.y) < 0.3, `marker ${JSON.stringify(m)} vs centre ${JSON.stringify(c)}`);
        centred += 1;
      }
    }
    assert.ok(centred >= 1, "at least one position should be well inside the drawing");
    map.click("Follow my bus");
    assert.equal(map.button("Follow my bus").getAttribute("aria-pressed"), "false");
    map.unmount();
  });

  it("starts a new route fitted to the whole route", () => {
    const first = ride("1");
    const map = mount(first, null);
    map.click("Zoom in");
    map.click("Zoom in");
    map.render(ride("1", "return"), null);
    assert.equal(map.button("Zoom out").disabled, true);
    map.unmount();
  });

  it("names every stop in view once zoomed far in, and only a few at full view", () => {
    const r = ride("RADHARANI");
    const atStop = r.stops.filter((stop) => stop.position && stop.distanceAlongMetres !== null)[4].distanceAlongMetres!;
    const map = mount(r, atStop);
    const names = () => map.container.querySelectorAll("text.ride-map-label").length;
    const inView = () => {
      const [x, y, w, h] = map.viewBox().split(" ").map(Number);
      return [...map.container.querySelectorAll("circle.ride-map-stop")].filter((c) => {
        const cx = Number(c.getAttribute("cx"));
        const cy = Number(c.getAttribute("cy"));
        return cx >= x && cx <= x + w && cy >= y && cy <= y + h;
      }).length;
    };
    assert.ok(names() <= 5, `at full view only the ends, the stop you are at, the next and your stop are named, got ${names()}`);
    map.click("Follow my bus");
    for (let i = 0; i < 3; i += 1) map.click("Zoom in");
    assert.ok(inView() >= 1, "the stop the bus is at should be in view");
    assert.equal(names(), inView(), "every stop in view is named at high zoom");
    map.unmount();
  });
});
