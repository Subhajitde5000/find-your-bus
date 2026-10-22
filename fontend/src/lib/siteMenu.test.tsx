/*
 * The phone and tablet navigation drawer, in a DOM: the button opens it, it lists the stop
 * map, Escape and the scrim close it, a link closes it, and the page behind it cannot
 * scroll while it is open.
 *
 * The drawer is hidden by CSS above 900px; those media queries are asserted in the
 * stylesheet itself (see the note in the last test), not here.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

const Module = require("node:module") as { _load: any };
const { JSDOM, VirtualConsole } = require("jsdom") as typeof import("jsdom");

const originalLoad = Module._load;
Module._load = function patched(request: string, parent: unknown, isMain: boolean): unknown {
  if (request === "next/link") {
    const react = originalLoad.call(Module, "react", parent, isMain);
    return { __esModule: true, default: ({ href, children, ...rest }: any) => react.createElement("a", { href, ...rest }, children) };
  }
  if (request === "next/navigation") {
    return { __esModule: true, usePathname: () => currentPath, useRouter: () => ({ push() {}, replace() {}, back() {} }) };
  }
  return originalLoad.call(Module, request, parent, isMain);
};

let currentPath = "/map";

// jsdom cannot follow a link to another document and says so on stderr; the anchors here
// are stubs anyway, so that one complaint is dropped.
const virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", () => {});

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/map",
  pretendToBeVisual: true,
  virtualConsole,
});
const win: any = dom.window;
const g = globalThis as any;
g.window = win;
g.document = win.document;
for (const name of ["HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent"]) g[name] = win[name];
g.getComputedStyle = win.getComputedStyle.bind(win);
g.IS_REACT_ACT_ENVIRONMENT = true;

const React = require("react") as typeof import("react") & { act: (cb: () => void) => void };
const { createRoot } = require("react-dom/client") as typeof import("react-dom/client");
const { SiteMenu } = require("@/components/SiteMenu") as typeof import("@/components/SiteMenu");

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
  const key = (name: string) => act(() => void win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: name, bubbles: true })));
  // The panel is portalled into <body>, so it is looked for there, not in the container.
  const drawer = () => win.document.querySelector(".site-menu") as HTMLElement | null;
  const scrim = () => win.document.querySelector(".site-menu-scrim") as HTMLElement | null;
  const trigger = () => container.querySelector(".site-menu-trigger") as HTMLButtonElement;
  return {
    container,
    click,
    key,
    drawer,
    scrim,
    trigger,
    text: () => container.textContent ?? "",
    unmount: () => act(() => root.unmount()),
  };
}

after(() => {
  Module._load = originalLoad;
});

describe("the navigation drawer", () => {
  it("starts closed, with the button saying so", () => {
    const menu = mount(React.createElement(SiteMenu));
    try {
      const trigger = menu.trigger();
      assert.ok(trigger, "there is a menu button");
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      assert.equal(trigger.getAttribute("aria-controls"), "site-menu");
      assert.equal(menu.drawer(), null, "nothing is drawn until it is opened");
      assert.equal(win.document.body.style.overflow, "", "and the page scrolls normally");
    } finally {
      menu.unmount();
    }
  });

  it("opens from the button and lists the stop map", () => {
    const menu = mount(React.createElement(SiteMenu));
    try {
      menu.click(menu.trigger());
      assert.equal(menu.trigger().getAttribute("aria-expanded"), "true");
      const drawer = menu.drawer();
      assert.ok(drawer, "the drawer is drawn");
      assert.equal(drawer!.parentElement, win.document.body, "outside the header, so fixed positioning works");
      assert.equal(drawer!.getAttribute("role"), "dialog");
      assert.equal(drawer!.getAttribute("aria-modal"), "true");
      assert.equal(drawer!.getAttribute("aria-label"), "Site navigation");
      const stopMap = drawer!.querySelector("a[href='/map']");
      assert.ok(stopMap, "the drawer links to the stop map");
      assert.match(stopMap!.textContent ?? "", /Stop map/);
      // and the rest of the site's links travel with it
      for (const href of ["/", "/#search", "/#route", "/#how-it-works", "/#about"]) {
        assert.ok(drawer!.querySelector(`a[href='${href}']`), `missing ${href}`);
      }
    } finally {
      menu.unmount();
    }
  });

  it("marks the page you are on", () => {
    currentPath = "/map";
    const menu = mount(React.createElement(SiteMenu));
    try {
      menu.click(menu.trigger());
      const stopMap = menu.drawer()!.querySelector("a[href='/map']")!;
      assert.equal(stopMap.getAttribute("aria-current"), "page");
      assert.ok(stopMap.className.includes("active"));
      assert.equal(menu.drawer()!.querySelector("a[href='/']")!.getAttribute("aria-current"), null);
    } finally {
      menu.unmount();
      currentPath = "/";
    }
  });

  it("closes on Escape, on the scrim and on a link, and never leaves the page locked", () => {
    const menu = mount(React.createElement(SiteMenu));
    try {
      menu.click(menu.trigger());
      assert.equal(win.document.body.style.overflow, "hidden", "the page behind does not scroll");
      menu.key("Escape");
      assert.equal(menu.trigger().getAttribute("aria-expanded"), "false");
      assert.equal(win.document.body.style.overflow, "", "scrolling is handed back");

      menu.click(menu.trigger());
      menu.click(menu.scrim());
      assert.equal(menu.trigger().getAttribute("aria-expanded"), "false", "the scrim closes it too");

      menu.click(menu.trigger());
      menu.click(menu.drawer()!.querySelector("a[href='/map']"));
      assert.equal(menu.trigger().getAttribute("aria-expanded"), "false", "following a link closes it");
    } finally {
      menu.unmount();
    }
  });

  it("tells the home page which search mode was chosen", () => {
    const chosen: string[] = [];
    const menu = mount(React.createElement(SiteMenu, { onChooseSearch: (mode: string) => chosen.push(mode) }));
    try {
      menu.click(menu.trigger());
      menu.click(menu.drawer()!.querySelector("a[href='/#route']"));
      menu.click(menu.trigger());
      menu.click(menu.drawer()!.querySelector("a[href='/#search']"));
      assert.deepEqual(chosen, ["route", "journey"]);
    } finally {
      menu.unmount();
    }
  });
});
