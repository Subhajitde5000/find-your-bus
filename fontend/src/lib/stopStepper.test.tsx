/*
 * "Stops, one at a time" — the stop card, in a DOM, plus the maths behind it.
 *
 * The map already prints every stop name once it is zoomed past 2.5x, and the stop list
 * prints the whole route. This card is the third way: a single stop, big enough to read
 * from a moving bus, with a thumb-sized way to walk to the next one. The tests are about
 * the things that would make it useless in practice — it must open on the stop the
 * passenger is about to reach, never jump from the terminus back to the start, never print
 * a distance for a stop with no position, and never claim a passed stop is ahead.
 *
 * Run with: npm test
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
g.KeyboardEvent = win.KeyboardEvent;
g.getComputedStyle = win.getComputedStyle.bind(win);
// Tapping a stop opens the buses panel, which reads `self` the way a worker does.
g.self = win;
g.requestAnimationFrame = win.requestAnimationFrame.bind(win);
g.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
Object.defineProperty(g, "navigator", { value: win.navigator, configurable: true, writable: true });
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const { renderToStaticMarkup } = require("react-dom/server") as typeof import("react-dom/server");
const { StopStepper } = require("@/components/StopStepper") as typeof import("@/components/StopStepper");
const { RideRouteMap } = require("@/components/RideRouteMap") as typeof import("@/components/RideRouteMap");
const { buildRide, matchRide, pointAtMetres } = require("@/lib/ride") as typeof import("@/lib/ride");
type RideLeg = import("@/lib/ride").RideLeg;
const { openingStop, stepStop, stopPosition, stopRole, legAhead } =
  require("@/lib/stopStep") as typeof import("@/lib/stopStep");

function rideOf(number = "1", direction: "outbound" | "return" = "outbound") {
  const built = buildRide({ number, direction });
  assert.ok(built.ok, `route ${number} should build`);
  return built.ride;
}

const contexts = {
  before: { currentStop: null, nextStopIndex: null, destinationIndex: 4, passed: new Set<number>(), onBus: false },
  aboard: { currentStop: 2, nextStopIndex: 3, destinationIndex: 6, passed: new Set([0, 1, 2]), onBus: true },
};

describe("one stop at a time: the maths", () => {
  it("opens on the next stop, then where the passenger is, then the start", () => {
    assert.equal(openingStop(10, contexts.aboard), 3, "the stop about to be reached");
    assert.equal(openingStop(10, { ...contexts.aboard, nextStopIndex: null }), 2, "where the bus is");
    assert.equal(openingStop(10, contexts.before), 0, "before the match, the first stop");
    assert.equal(openingStop(10, { ...contexts.aboard, nextStopIndex: 99 }), 2, "a bad index is ignored, not shown");
    assert.equal(openingStop(0, contexts.aboard), 0, "an empty route still gives a number");
  });

  it("stops at the ends instead of wrapping round", () => {
    assert.equal(stepStop(0, -1, 8), 0, "no stop before the first one");
    assert.equal(stepStop(7, 1, 8), 7, "no stop after the last one");
    assert.equal(stepStop(3, 1, 8), 4);
    assert.equal(stepStop(3, -1, 8), 2);
    assert.equal(stepStop(0, -1, 0), 0, "an empty route cannot be walked");
  });

  it("names a stop by how it sits on this journey", () => {
    assert.equal(stopRole(2, contexts.aboard), "current");
    assert.equal(stopRole(3, contexts.aboard), "next");
    assert.equal(stopRole(6, contexts.aboard), "destination");
    assert.equal(stopRole(1, contexts.aboard), "passed");
    assert.equal(stopRole(5, contexts.aboard), "ahead");
    // The place you get off is your stop even after it is behind you.
    assert.equal(stopRole(2, { ...contexts.aboard, destinationIndex: 2 }), "current");
    assert.equal(stopRole(1, { ...contexts.aboard, destinationIndex: 1 }), "destination");
    // Before the bus is matched, nothing is "current" or "next".
    assert.equal(stopRole(0, contexts.before), "ahead");
  });

  it("counts a stop out of the route without ever printing 0", () => {
    assert.equal(stopPosition(0, 7), "1 of 7");
    assert.equal(stopPosition(6, 7), "7 of 7");
    assert.equal(stopPosition(9, 7), "7 of 7", "clamped, not out of range");
    assert.equal(stopPosition(0, 0), "1 of 0", "never a bare 0");
  });

  it("does not invent a distance for a stop with no position", () => {
    assert.deepEqual(legAhead(undefined), { passed: false, metres: null, minutes: null });
    assert.equal(legAhead({ passed: true, metresFromHere: null, minutesFromHere: null } as any).metres, null);
    const measured = legAhead({ passed: false, metresFromHere: 820, minutesFromHere: 3 } as any);
    assert.equal(measured.metres, 820);
    assert.equal(measured.minutes, 3);
  });
});

describe("one stop at a time: the card", () => {
  /** The legs the ride engine would hand over: measured behind, scheduled ahead. */
  function legsFor(ride: ReturnType<typeof rideOf>, passed: Set<number>) {
    return ride.stops.map((stop): RideLeg => ({
      index: stop.index,
      name: stop.name,
      metresFromHere: passed.has(stop.index) ? null : 300 + stop.index * 420,
      minutesFromHere: passed.has(stop.index) ? null : 2 + stop.index,
      eta: 540 + stop.index * 3,
      scheduled: true,
      basis: (stop.position ? "published" : "none") as RideLeg["basis"],
      isDestination: stop.index === 6,
      isNext: stop.index === 3,
      passed: passed.has(stop.index),
      hasPosition: Boolean(stop.position),
    }));
  }

  function render(props: Partial<Parameters<typeof StopStepper>[0]> = {}) {
    const ride = rideOf("1");
    const destination = 6;
    return renderToStaticMarkup(
      React.createElement(StopStepper, {
        ride,
        legs: legsFor(ride, new Set([0, 1, 2])),
        currentStop: 2,
        destinationIndex: destination,
        nextStopIndex: 3,
        onBus: true,
        passed: new Set([0, 1, 2]),
        focused: null,
        onFocus: () => {},
        onReset: () => {},
        ...props,
      }),
    );
  }

  it("shows one stop, the next one, and says how far along the route it is", () => {
    const ride = rideOf("1");
    const html = render();
    assert.ok(html.includes("ob-stepper"), "the card is there");
    assert.ok(html.includes(escape(ride.stops[3].name)), "the next stop is the one on show");
    assert.ok(html.includes(`${4} of ${ride.stops.length}`), "and where it sits in the route");
    assert.ok(html.includes("Next stop"));
    // Only that stop's name: the card must not quietly become a second list.
    for (const stop of ride.stops) {
      if (stop.index !== 3) {
        assert.ok(
          !html.includes(`>${escape(stop.name)}<`),
          `${stop.name} should not be printed as a stop name in the one-at-a-time card`,
        );
      }
    }
  });

  it("goes back to a real stop when the passenger picks the last one", () => {
    const ride = rideOf("1");
    const last = ride.stops.length - 1;
    const html = render({ focused: last });
    assert.ok(html.includes(escape(ride.stops[last].name)));
    assert.ok(html.includes(`${last + 1} of ${ride.stops.length}`));
    assert.ok(html.includes("Back to my bus"), "and offers the way back to the live position");
  });

  it("marks a stop behind the bus as passed rather than ahead", () => {
    const html = render({ focused: 1 });
    assert.ok(html.includes('data-role="passed"'), "the card knows it is behind");
    assert.ok(html.includes("Passed"));
    assert.ok(html.includes("behind you"));
    assert.ok(!/ ahead<\/span>/.test(html), "no distance ahead for a stop already behind");
  });

  it("keeps working with no position, no legs and no next stop", () => {
    const html = render({ legs: [], currentStop: null, nextStopIndex: null, onBus: false, passed: new Set() });
    assert.ok(html.includes("—"), "an unknown stop prints a dash, not a guess");
    assert.ok(html.includes("ob-stepper"));
    assert.ok(!html.includes("NaN"));
    assert.ok(!html.includes("undefined"));
    assert.ok(!html.includes("null"));
  });

  it("walks the route with the arrow buttons, the keyboard and a swipe", () => {
    const ride = rideOf("1");
    let focused: number | null = 3;
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    const paint = () =>
      React.act(() => {
        root.render(
          React.createElement(StopStepper, {
            ride,
            legs: legsFor(ride, new Set([0, 1, 2])),
            currentStop: 2,
            destinationIndex: 6,
            nextStopIndex: 3,
            onBus: true,
            passed: new Set([0, 1, 2]),
            focused,
            onFocus: (index: number) => {
              focused = index;
              paint();
            },
            onReset: () => {
              focused = null;
              paint();
            },
          }),
        );
      });
    paint();

    const read = () => {
      const strong = container.querySelector(".ob-stepper-name");
      assert.ok(strong, "the stop name is rendered");
      return strong.textContent ?? "";
    };
    const button = (label: string) => {
      const el = container.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
      assert.ok(el, `no button "${label}"`);
      return el;
    };
    const click = (label: string) =>
      React.act(() => {
        button(label).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });

    assert.equal(read(), ride.stops[3].name, "opens on the next stop");

    click("Next stop");
    assert.equal(read(), ride.stops[4].name, "the right arrow moves on");
    click("Previous stop");
    assert.equal(read(), ride.stops[3].name, "and back");

    // Keyboard: the card is a single tab stop that walks the route.
    const body = container.querySelector(".ob-stepper-body") as HTMLElement;
    const key = (name: string) =>
      React.act(() => {
        body.dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
      });
    key("ArrowRight");
    assert.equal(read(), ride.stops[4].name);
    key("ArrowLeft");
    assert.equal(read(), ride.stops[3].name);
    key("End");
    assert.equal(read(), ride.stops[ride.stops.length - 1].name, "End jumps to the terminus");
    assert.equal(button("Next stop").disabled, true, "and the arrow is disabled there");
    key("Home");
    assert.equal(read(), ride.stops[0].name, "Home jumps to the start");
    assert.equal(button("Previous stop").disabled, true);

    // A swipe left goes forward; a vertical drag is left to the page.
    React.act(() => {
      body.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 100 }));
      body.dispatchEvent(new win.MouseEvent("pointerup", { bubbles: true, clientX: 140, clientY: 104 }));
    });
    assert.equal(read(), ride.stops[1].name, "a left swipe moves on one stop");

    React.act(() => {
      body.dispatchEvent(new win.MouseEvent("pointerdown", { bubbles: true, clientX: 200, clientY: 100 }));
      body.dispatchEvent(new win.MouseEvent("pointerup", { bubbles: true, clientX: 196, clientY: 190 }));
    });
    assert.equal(read(), ride.stops[1].name, "a vertical drag does not change the stop");

    // The dots jump straight to a destination stop, named for screen readers.
    const dot = container.querySelectorAll(".ob-stepper-dot");
    assert.equal(dot.length, ride.stops.length, "one dot per stop on a short route");
    React.act(() => {
      (dot[5] as HTMLElement).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(read(), ride.stops[5].name);
    const reset = container.querySelector(".ob-stepper-reset") as HTMLButtonElement | null;
    assert.ok(reset, "the way back to the live position is offered once the passenger has wandered");
    React.act(() => {
      reset.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(read(), ride.stops[3].name, "back to the live position");
    root.unmount();
    container.remove();
  });

  it("drops the dot rail on a route too long to tap", () => {
    // MM3 runs the length of the city: fifty-odd stops, far too many for a rail of dots.
    const long = ["MM3", "230", "12C", "RADHARANI"].map((number) => rideOf(number)).find((candidate) => candidate.stops.length > 24);
    assert.ok(long, "some route in the directory is long enough");
    const html = renderToStaticMarkup(
      React.createElement(StopStepper, {
        ride: long,
        legs: legsFor(long, new Set<number>()),
        currentStop: 0,
        destinationIndex: long.stops.length - 1,
        nextStopIndex: 1,
        onBus: true,
        passed: new Set<number>(),
        focused: 0,
        onFocus: () => {},
        onReset: () => {},
      }),
    );
    assert.ok(!html.includes("ob-stepper-dots"), "no rail of untappable dots");
    assert.ok(html.includes("ob-stepper-arrow"), "the arrows remain");
  });
});

describe("one stop at a time: the map follows", () => {
  it("centres on the stop on show, prints its name and rings it", () => {
    const ride = rideOf("1");
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    const paint = (focus: number | null) =>
      React.act(() => {
        root.render(
          React.createElement(RideRouteMap, {
            ride,
            metresAlong: null,
            onBus: false,
            currentStop: null,
            destinationIndex: ride.stops.length - 1,
            nextStopIndex: null,
            passed: new Set<number>(),
            focusIndex: focus,
          }),
        );
      });
    paint(null);
    const fitted = (container.querySelector("svg.ride-map-svg") as SVGSVGElement).getAttribute("viewBox");
    assert.ok(container.querySelector("svg.ride-map-svg"), "the map is drawn");
    assert.ok(!container.querySelector(".ride-map-focus"), "nothing is ringed before the passenger walks");

    paint(4);
    const zoomed = (container.querySelector("svg.ride-map-svg") as SVGSVGElement).getAttribute("viewBox");
    assert.notEqual(zoomed, fitted, "the map moved and zoomed in");
    const labelled = [...container.querySelectorAll(".ride-map-label")].map((node) => node.textContent);
    assert.ok(labelled.includes(ride.stops[4].name), `the stop on show is named on the map: ${labelled.join(", ")}`);
    assert.ok(container.querySelector(".ride-map-focus"), "and ringed, so the card and the map agree");

    // The card in the page is the other direction of the same conversation: a tap on the map
    // tells the card which stop to show.
    const told: number[] = [];
    React.act(() => {
      root.render(
        React.createElement(RideRouteMap, {
          ride,
          metresAlong: null,
          onBus: false,
          currentStop: null,
          destinationIndex: ride.stops.length - 1,
          nextStopIndex: null,
          passed: new Set<number>(),
          focusIndex: null,
          onFocusStop: (index: number) => told.push(index),
        }),
      );
    });
    const hit = container.querySelectorAll(".ride-map-hit");
    React.act(() => {
      (hit[2] as unknown as SVGElement).dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(told.length > 0, "tapping a stop tells the card");
    root.unmount();
    container.remove();
  });

  it("leaves the map where the passenger put it when the stop does not change", () => {
    // Same focus twice is not a reason to yank the map back: the wheel/pinch position wins.
    const ride = rideOf("1");
    const container = win.document.createElement("div");
    win.document.body.appendChild(container);
    const root = createRoot(container);
    const paint = (focus: number | null) =>
      React.act(() => {
        root.render(
          React.createElement(RideRouteMap, {
            ride,
            metresAlong: null,
            onBus: false,
            currentStop: null,
            destinationIndex: ride.stops.length - 1,
            nextStopIndex: null,
            passed: new Set<number>(),
            focusIndex: focus,
          }),
        );
      });
    paint(3);
    const box = () => (container.querySelector("svg.ride-map-svg") as SVGSVGElement).getAttribute("viewBox");
    const after = box();
    paint(3);
    assert.equal(box(), after, "a re-render does not move the map");
    root.unmount();
    container.remove();
  });
});

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
