/*
 * End-to-end tests of the two QR screens, in a DOM.
 *
 * The engines are covered by qr.test.ts, onBus.test.ts and stopBoard.test.ts. These two
 * tests cover the wiring a passenger actually meets: that a scanned link renders the
 * right route and stop, that the stop board lists real buses, and that the honest
 * "no published bus here right now" state is reachable instead of a crash.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const Module = require("node:module") as { _load: any };
const { JSDOM } = require("jsdom") as typeof import("jsdom");

let searchQuery = "";

const originalLoad = Module._load;
Module._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/navigation") {
    return {
      __esModule: true,
      useSearchParams: () => new URLSearchParams(searchQuery),
      useRouter: () => ({ push() {}, replace() {}, back() {} }),
      usePathname: () => "/qr",
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
  url: "http://localhost/qr/bus",
  pretendToBeVisual: true,
});

const g = globalThis as any;
const win: any = dom.window;
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
g.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(g, "navigator", { value: win.navigator, configurable: true, writable: true });

// The screens ask for one position; these tests never wait for it, because every state
// they check is reachable without a fix (the stop comes from the link).
Object.defineProperty(win.navigator, "geolocation", {
  configurable: true,
  value: {
    getCurrentPosition() {
      /* deliberately never answers: the page must work while locating */
    },
  },
});

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const OnBusPage = (require("@/app/qr/bus/page") as { default: React.FC }).default;
const StopQrPage = (require("@/app/qr/stop/page") as { default: React.FC }).default;

/** Every root this file mounts, so the clock intervals can be cleared on the way out. */
const mounted: { unmount: () => void }[] = [];

interface Mounted {
  container: HTMLElement;
  unmount: () => void;
  text: () => string;
  click: (label: string) => void;
  links: () => string[];
}

function mount(Page: React.FC, query: string): Mounted {
  searchQuery = query;
  const container = win.document.createElement("div");
  win.document.body.appendChild(container);
  const root = createRoot(container);
  React.act(() => {
    root.render(React.createElement(Page));
  });
  const handle: Mounted = {
    container,
    unmount: () => React.act(() => root.unmount()),
    text: () => container.textContent ?? "",
    click: (label: string) => {
      const nodes = Array.from(container.querySelectorAll("button")) as HTMLElement[];
      const target = nodes.find((node) => (node.textContent ?? "").trim().includes(label));
      assert.ok(target, `no button labelled "${label}". Found: ${nodes.map((node) => node.textContent).join(" | ")}`);
      React.act(() => {
        target.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    links: () => (Array.from(container.querySelectorAll("a")) as HTMLAnchorElement[]).map((anchor) => anchor.getAttribute("href") ?? ""),
  };
  mounted.push(handle);
  return handle;
}

describe("the /qr/bus page, in a DOM", () => {
  after(() => {
    for (const handle of mounted.splice(0)) handle.unmount();
    Module._load = originalLoad;
  });

  let page: Mounted;

  before(() => {
    page = mount(OnBusPage, "r=1&d=o&from=Exide");
  });

  it("identifies the route on the sticker and the stop from the link", () => {
    const text = page.text();
    assert.match(text, /Bus 1/);
    assert.match(text, /Ramnagar/);
    assert.match(text, /Mukundapur/);
    assert.match(text, /Your stop/);
    assert.match(text, /Exide/);
    assert.match(text, /On bus sticker/);
  });

  it("offers the stops still ahead as an optional destination", () => {
    const select = page.container.querySelector("select") as HTMLSelectElement | null;
    assert.ok(select, "the destination picker should be on the page");
    const options = Array.from(select.options).map((option) => option.value);
    assert.ok(options.includes("Park Circus"));
    assert.ok(options.includes("Mukundapur"));
    assert.equal(options.includes("Exide"), false, "the boarding stop is not ahead");
  });

  it("either names a likely bus or says honestly that none is published now", () => {
    const text = page.text();
    const identified = /Your bus is probably the/.test(text);
    const empty = /No published bus here right now|This route has no published times/.test(text);
    assert.ok(identified || empty, `expected an identification or an honest empty state, got: ${text.slice(0, 400)}`);
  });

  it("links onward to the ride screen with the route, direction and stop", () => {
    const ride = page.links().find((href) => href.startsWith("/ride?"));
    assert.ok(ride, "a ride link should be offered");
    assert.match(ride, /route=1/);
    assert.match(ride, /dir=outbound/);
    assert.match(ride, /from=Exide/);
  });

  it("can switch direction, and then works from the other end of the route", () => {
    page.click("Travelling the other way?");
    const text = page.text();
    // The card reads "origin -> destination", so the names swap rather than gaining a "to".
    assert.ok(text.indexOf("Mukundapur") < text.indexOf("Ramnagar"), "termini should be reversed");
  });

  it("does not pretend to know a route that is not in the directory", () => {
    const missing = mount(OnBusPage, "r=ZZZ999");
    assert.match(missing.text(), /not in this directory/);
    assert.match(missing.text(), /Search the timetable/);
    missing.unmount();
  });

  it("shows the route search instead of crashing when the link has no route", () => {
    const blank = mount(OnBusPage, "");
    assert.match(blank.text(), /This sticker has no route/);
    const field = blank.container.querySelector('input[aria-label="Route number"]');
    assert.ok(field, "the route search box should be offered");
    blank.unmount();
  });
});

describe("the /qr/stop page, in a DOM", () => {
  after(() => {
    for (const handle of mounted.splice(0)) handle.unmount();
  });
  it("renders the stop from the link and lists the whole day on request", () => {
    const page = mount(StopQrPage, "s=Esplanade");
    assert.match(page.text(), /Esplanade/);
    assert.match(page.text(), /Bus stop sticker/);
    assert.match(page.text(), /Next 2 hours/);
    assert.match(page.text(), /Whole day/);

    page.click("Whole day");
    const groups = page.container.querySelectorAll(".qr-day-group");
    assert.ok(groups.length > 10, `the whole day should group buses by route, got ${groups.length}`);
    assert.ok(groups.length < 700, "a stop has hundreds of routes at most, not thousands of rows");
    assert.match(page.text(), /Every route at this stop/);
    page.unmount();
  });

  it("says so for a stop the directory does not know", () => {
    const page = mount(StopQrPage, "s=Not A Real Stop");
    assert.match(page.text(), /No stop with that name/);
    page.unmount();
  });

  it("asks which stop when the link carries none, and offers a search", () => {
    const page = mount(StopQrPage, "");
    assert.match(page.text(), /Which stop are you at/);
    assert.ok(page.container.querySelector('input[type="search"]'), "a stop search should be offered");
    page.unmount();
  });
});
