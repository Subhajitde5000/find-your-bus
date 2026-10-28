/*
 * End-to-end tests of the QR screens, in a DOM.
 *
 * The library tests cover the link format, the run identification and the stop
 * timetable. These cover the wiring, which is where a QR feature actually breaks:
 * that /on-bus asks for a destination only once it has placed the passenger, that
 * /stop switches between "next" and "the whole day", and that /scan refuses a code from
 * another website instead of following it.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

// Requires, not imports: the DOM and the next/navigation stub must exist before the
// page modules are loaded.
const Module = require("node:module") as { _load: any };
const { JSDOM } = require("jsdom") as typeof import("jsdom");

interface Watcher {
  onFix: (position: unknown) => void;
  onError: (error: unknown) => void;
}

const captured: { watchers: Watcher[] } = { watchers: [] };
const pushes: string[] = [];
let searchQuery = "";
let nextWatchId = 1;

const originalLoad = Module._load;
Module._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/navigation") {
    return {
      __esModule: true,
      useSearchParams: () => new URLSearchParams(searchQuery),
      useRouter: () => ({
        push: (href: string) => pushes.push(href),
        replace: (href: string) => pushes.push(href),
        back() {},
      }),
      usePathname: () => "/",
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
  url: "https://pathsathi.example/",
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
g.IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(win.navigator, "geolocation", {
  value: {
    watchPosition(onFix: (position: unknown) => void, onError: (error: unknown) => void) {
      captured.watchers.push({ onFix, onError });
      return nextWatchId++;
    },
    clearWatch() {},
  },
  configurable: true,
});

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const OnBusPage = (require("@/app/on-bus/page") as { default: React.FC }).default;
const StopPage = (require("@/app/stop/page") as { default: React.FC }).default;
const ScanPage = (require("@/app/scan/page") as { default: React.FC }).default;
const { buildRide } = require("@/lib/ride") as typeof import("@/lib/ride");

interface Mounted {
  container: HTMLElement;
  unmount: () => void;
  text: () => string;
  click: (label: string) => void;
  fill: (selector: string, value: string) => void;
  submit: (selector: string) => void;
  sendFix: (lat: number, lng: number, seconds: number) => void;
}

function mount(Component: React.FC, query: string): Mounted {
  searchQuery = query;
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  const act = (fn: () => void) => React.act(fn);

  act(() => {
    root.render(React.createElement(Component));
  });

  return {
    container,
    unmount: () => act(() => root.unmount()),
    text: () => container.textContent ?? "",
    click: (label: string) => {
      const nodes = Array.from(container.querySelectorAll("button, a")) as HTMLElement[];
      const target = nodes.find((node) => (node.textContent ?? "").includes(label));
      assert.ok(target, `no control labelled "${label}". Found: ${nodes.map((n) => n.textContent).join(" | ")}`);
      act(() => {
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    fill: (selector: string, value: string) => {
      const input = container.querySelector(selector) as HTMLInputElement | null;
      assert.ok(input, `no input matching ${selector}`);
      const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, "value")?.set;
      act(() => {
        setter?.call(input, value);
        input.dispatchEvent(new win.Event("input", { bubbles: true }));
      });
    },
    submit: (selector: string) => {
      const form = container.querySelector(selector) as HTMLFormElement | null;
      assert.ok(form, `no form matching ${selector}`);
      act(() => {
        form.dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
      });
    },
    sendFix: (lat: number, lng: number, seconds: number) => {
      act(() => {
        for (const watcher of [...captured.watchers]) {
          watcher.onFix({
            coords: { latitude: lat, longitude: lng, accuracy: 8 },
            timestamp: 1_700_000_000_000 + seconds * 1000,
          });
        }
      });
    },
  };
}

function locatedStop(routeNumber: string) {
  const built = buildRide({ number: routeNumber, direction: "outbound" });
  if (!built.ok) assert.fail(`route ${routeNumber} should build`);
  const stop = built.ride.stops.find((candidate) => candidate.position);
  assert.ok(stop?.position, `route ${routeNumber} should have a located stop`);
  return stop!.position as { lat: number; lng: number };
}

function settle(page: Mounted, point: { lat: number; lng: number }) {
  page.sendFix(point.lat, point.lng, 0);
  page.sendFix(point.lat, point.lng, 1);
  page.sendFix(point.lat, point.lng, 2);
}

after(() => {
  Module._load = originalLoad;
});

// ---------------------------------------------------------------------- /on-bus

describe("the /on-bus screen, in a DOM", () => {
  it("offers to find the passenger without any GPS reading", () => {
    captured.watchers.length = 0;
    const page = mount(OnBusPage, "route=1");
    try {
      assert.ok(page.text().includes("Find yourself on this bus"), page.text().slice(0, 300));
      assert.ok(page.text().includes("Find my bus"));
      assert.ok(page.text().includes("No signal? Choose your stop instead"), "the fallback is offered up front");
      assert.equal(captured.watchers.length, 0, "nothing is watched until the passenger asks");
      assert.ok(page.container.querySelector(".ob-peek-stops"), "the route's own stops are listed already");
    } finally {
      page.unmount();
    }
  });

  it("opens the watch once, when the passenger taps 'Find my bus'", () => {
    captured.watchers.length = 0;
    const page = mount(OnBusPage, "route=1");
    try {
      page.click("Find my bus");
      assert.equal(captured.watchers.length, 1);
      assert.ok(page.text().includes("Finding you"), page.text().slice(0, 300));
    } finally {
      page.unmount();
    }
  });

  it("identifies a bus and then asks for a destination", () => {
    captured.watchers.length = 0;
    const page = mount(OnBusPage, "route=1");
    try {
      page.click("Find my bus");
      settle(page, locatedStop("1"));
      assert.ok(page.container.querySelector(".ob-ident"), `no identification card: ${page.text().slice(0, 500)}`);
      assert.match(
        page.text(),
        /Most likely|Probably|No bus matches this time closely/,
        "the card says how sure it is",
      );
      assert.match(page.text(), /run RUN-1-OUT/i, "the run from the workbook is named");
      assert.ok(page.text().includes("Where are you getting off?"), "and the destination is asked once we are placed");

      const firstStop = page.container.querySelector(".ob-destination .qr-stop-shortlist button") as HTMLElement | null;
      assert.ok(firstStop, "the stops ahead are offered");
      // Click the stop itself rather than its label: the label carries a time too.
      React.act(() => {
        firstStop!.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      assert.ok(page.text().includes("Get off at"), page.text().slice(0, 500));
      assert.match(page.text(), /stop \d+ of \d+/, "the journey card counts the stops");
    } finally {
      page.unmount();
    }
  });

  it("asks which way the bus is going when both directions fit the position", () => {
    captured.watchers.length = 0;
    const page = mount(OnBusPage, "route=1");
    try {
      page.click("Find my bus");
      // The route's first located stop is a terminus: both directions' corridors reach
      // it, so the position alone cannot say which way the bus is pointing.
      settle(page, locatedStop("1"));
      assert.ok(
        page.text().includes("Which way is this bus going?"),
        `no direction question: ${page.text().slice(0, 600)}`,
      );
      assert.ok(page.text().includes("towards Ramnagar") || page.text().includes("towards Metiabruz"));
      // Answering it fixes the direction and takes the question away.
      const choices = page.container.querySelectorAll(".ob-ask .qr-direction-switch button");
      assert.equal(choices.length, 2);
      React.act(() => {
        (choices[1] as HTMLElement).dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      assert.ok(!page.text().includes("Which way is this bus going?"), "the question is answered once");
    } finally {
      page.unmount();
    }
  });

  it("can follow the bus without choosing a destination", () => {
    captured.watchers.length = 0;
    const page = mount(OnBusPage, "route=1");
    try {
      page.click("Find my bus");
      settle(page, locatedStop("1"));
      page.click("Skip — follow this bus to");
      assert.ok(!page.text().includes("Where are you getting off?"), "the question is dismissed");
      assert.ok(page.text().includes("Scan another code"), "and the screen still explains itself");
    } finally {
      page.unmount();
    }
  });

  it("refuses a link that is not a bus sticker", () => {
    const page = mount(OnBusPage, "");
    try {
      assert.ok(page.text().includes("This is not a bus sticker"), page.text().slice(0, 300));
      assert.ok(page.text().includes("Scan a QR code"));
    } finally {
      page.unmount();
    }
  });

  it("says plainly when the sticker names a route this copy does not have", () => {
    const page = mount(OnBusPage, "route=NO-SUCH-ROUTE");
    try {
      assert.match(page.text(), /is not in this directory/);
      assert.ok(page.text().includes("NO-SUCH-ROUTE"));
    } finally {
      page.unmount();
    }
  });
});

// ---------------------------------------------------------------------- /stop

describe("the /stop screen, in a DOM", () => {
  it("shows the next buses from the stop, with a wait", () => {
    const page = mount(StopPage, "stop=Garia");
    try {
      assert.ok(page.text().includes("Garia"));
      assert.ok(page.text().includes("scheduled passes today"));
      assert.ok(page.text().includes("Published times, not live positions"));
      const rows = page.container.querySelectorAll(".stop-pass");
      assert.ok(rows.length > 0, "some buses pass Garia");
      assert.match(page.text(), /in \d+ min|due now|in \d+ hr/, "the wait is spelled out");
      assert.ok(page.container.querySelector(".stop-pass-go"), "every row leads to the bus screen");
    } finally {
      page.unmount();
    }
  });

  it("switches to the whole day, grouped by hour", () => {
    const page = mount(StopPage, "stop=Garia");
    try {
      page.click("Whole day");
      const hours = page.container.querySelectorAll(".stop-hour");
      assert.ok(hours.length > 0, "hours with buses are listed");
      assert.match(hours[0].textContent ?? "", /\d\d:00/);
      page.click("Whole day");
      const first = page.container.querySelector(".stop-hour .stop-hour-head") as HTMLElement | null;
      assert.ok(first, "and each hour can be opened");
    } finally {
      page.unmount();
    }
  });

  it("finds a stop from a name typed with a different spelling", () => {
    const page = mount(StopPage, "stop=Howrah%20Stn");
    try {
      assert.ok(page.text().includes("Howrah Railway Station"), "the alias resolves to the directory's own name");
    } finally {
      page.unmount();
    }
  });

  it("asks which stop when the sticker had no stop in it", () => {
    const page = mount(StopPage, "");
    try {
      assert.ok(page.text().includes("Which bus stop?"));
      assert.ok(page.container.querySelector(".stop-search"), "and offers a search");
    } finally {
      page.unmount();
    }
  });

  it("says so when a stop is not in the directory", () => {
    const page = mount(StopPage, "stop=Nowhere%20At%20All");
    try {
      assert.match(page.text(), /is not a stop in this directory/);
    } finally {
      page.unmount();
    }
  });
});

// ---------------------------------------------------------------------- /scan

describe("the /scan screen, in a DOM", () => {
  it("refuses a QR code from another website and says what it said", () => {
    pushes.length = 0;
    const page = mount(ScanPage, "");
    try {
      page.fill('input[type="url"]', "https://evil.example/on-bus?route=1");
      page.submit("form");
      assert.ok(page.text().includes("belongs to another website"), page.text().slice(0, 400));
      assert.equal(pushes.length, 0, "a foreign code never navigates");
      assert.ok(page.text().includes("evil.example"), "the raw value is shown for the record");
    } finally {
      page.unmount();
    }
  });

  it("opens a Pathsathi bus code in the app", () => {
    pushes.length = 0;
    const page = mount(ScanPage, "");
    try {
      page.fill('input[type="url"]', "/on-bus?route=230");
      page.submit("form");
      assert.deepEqual(pushes, ["/on-bus?route=230"]);
    } finally {
      page.unmount();
    }
  });

  it("opens a Pathsathi bus-stop code in the app", () => {
    pushes.length = 0;
    const page = mount(ScanPage, "");
    try {
      page.fill('input[type="url"]', "https://pathsathi.example/stop?stop=Esplanade");
      page.submit("form");
      assert.deepEqual(pushes, ["/stop?stop=Esplanade"]);
    } finally {
      page.unmount();
    }
  });

  it("explains both kinds of sticker without a camera", () => {
    const page = mount(ScanPage, "");
    try {
      assert.ok(page.text().includes("On a bus"));
      assert.ok(page.text().includes("At a bus stop"));
      assert.ok(page.text().includes("Read on the phone"), "and that scanning happens on the device");
    } finally {
      page.unmount();
    }
  });
});
