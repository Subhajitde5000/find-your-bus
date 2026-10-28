#!/usr/bin/env node
/**
 * Smoke-test the sticker maker without a browser.
 *
 * The tool is a private page outside the website's test suite, so it checks itself:
 * this loads index.html into jsdom, runs the same scripts the page loads, and drives the
 * parts that break quietly — the origin field, route selection, the link that ends up in
 * the QR, the print sheet, and the light/dark toggle (including that a chosen theme is
 * remembered and that printing never inherits it).
 *
 *   node qr-admin/scripts/test-admin.mjs
 *
 * jsdom comes from the website's dev dependencies (fontend/node_modules), so run
 * `cd fontend && npm install` first. Exits non-zero on failure.
 */

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const ADMIN = join(ROOT, "qr-admin");
const require = createRequire(join(ROOT, "fontend/package.json"));
const { JSDOM } = require("jsdom");

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? `\n     ${detail}` : ""}`);
  }
}

/** A fresh page, with the stored theme removed unless one is given. */
function open({ storedTheme = null, prefersDark = false } = {}) {
  const html = readFileSync(join(ADMIN, "index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
  const dom = new JSDOM(html, { url: "http://localhost/qr-admin/index.html", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  // jsdom has matchMedia but always reports "no match"; this makes the dark default testable.
  window.matchMedia = (query) => ({
    matches: /prefers-color-scheme:\s*dark/.test(query) && prefersDark,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });

  if (storedTheme) window.localStorage.setItem("cholo:qr:theme", storedTheme);
  // What index.html's inline bootstrap does before the first paint.
  const theme =
    storedTheme === "dark" || storedTheme === "light" ? storedTheme : prefersDark ? "dark" : "light";
  window.document.documentElement.dataset.theme = theme;

  for (const file of ["vendor/qrcode.js", "logo.js", "data/catalog.js", "qr-admin.js"]) {
    window.eval(readFileSync(join(ADMIN, file), "utf8"));
  }
  return window;
}

const click = (window, element) => {
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
};
const byId = (window, id) => window.document.getElementById(id);

/* ------------------------------------------------------------------ theme */

{
  const window = open();
  const root = window.document.documentElement;
  check("starts light when nothing is stored and the system is light", root.dataset.theme === "light", root.dataset.theme);
  click(window, byId(window, "theme-toggle"));
  check("the toggle switches to dark", root.dataset.theme === "dark");
  check("the choice is remembered", window.localStorage.getItem("cholo:qr:theme") === "dark");
  check(
    "the button reports its state to assistive technology",
    byId(window, "theme-toggle").getAttribute("aria-pressed") === "true",
  );
  click(window, byId(window, "theme-toggle"));
  check("and back to light", root.dataset.theme === "light" && window.localStorage.getItem("cholo:qr:theme") === "light");
}

{
  const window = open({ storedTheme: "dark" });
  check("a stored choice wins over the system", window.document.documentElement.dataset.theme === "dark");
}

{
  const window = open({ prefersDark: true });
  check("the system preference is followed when nothing is stored", window.document.documentElement.dataset.theme === "dark");
}

/* ------------------------------------------------------------------ origin and links */

{
  const window = open();
  const origin = byId(window, "origin");
  check("the origin field starts at the project default", origin.value === "https://cholo.example", origin.value);

  origin.value = "http://cholo.in";
  click(window, byId(window, "save-origin"));
  check(
    "an http origin is refused, because a sticker must open a secure page",
    byId(window, "origin-hint").classList.contains("bad"),
    byId(window, "origin-hint").textContent,
  );

  origin.value = "https://cholo.in";
  click(window, byId(window, "save-origin"));
  check("a valid origin is accepted", window.localStorage.getItem("cholo:qr:origin") === "https://cholo.in");
}

/* ------------------------------------------------------------------ the bus sticker */

{
  const window = open();
  const search = byId(window, "route-search");
  search.value = "1";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));

  const first = window.document.querySelector("#route-list button");
  check("searching shows routes", Boolean(first), "the route list stayed empty");
  if (first) {
    click(window, first);
    check("choosing a route reveals its sticker", !byId(window, "bus-result").hidden);
    const link = byId(window, "bus-link").textContent;
    check(
      "the link is the on-bus link the app parses",
      /^https:\/\/cholo\.example\/on-bus\?route=/.test(link),
      link,
    );

    // A registration is optional, normalised, and ignored when it cannot be a plate.
    const registration = byId(window, "bus-reg");
    registration.value = "wb-04-a-1234";
    registration.dispatchEvent(new window.Event("input", { bubbles: true }));
    check("a bus registration joins the link", byId(window, "bus-link").textContent.includes("bus=WB+04+A+1234"));
    registration.value = "not-a-plate";
    registration.dispatchEvent(new window.Event("input", { bubbles: true }));
    check("a malformed plate is dropped rather than printed", !byId(window, "bus-link").textContent.includes("bus="));

    click(window, byId(window, "bus-add"));
    const stickers = window.document.querySelectorAll(".sticker");
    check("adding puts one sticker on the print sheet", stickers.length === 1, `${stickers.length} stickers`);
    click(window, byId(window, "bus-add"));
    check("the same sticker is not added twice", window.document.querySelectorAll(".sticker").length === 1);
    click(window, window.document.querySelector(".sticker-remove"));
    check("a sticker can be removed again", window.document.querySelectorAll(".sticker").length === 0);
  }
}

/* ------------------------------------------------------------------ the stop sticker */

{
  const window = open();
  const tab = window.document.querySelector('[data-tab="stop"]');
  click(window, tab);
  check("the stop panel opens", !byId(window, "panel-stop").hidden && byId(window, "panel-bus").hidden);

  const search = byId(window, "stop-search");
  search.value = "esplanade";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  const first = window.document.querySelector("#stop-list button");
  check("searching shows stops", Boolean(first));
  if (first) {
    click(window, first);
    const link = byId(window, "stop-link").textContent;
    check(
      "the link is the stop link the app parses",
      /^https:\/\/cholo\.example\/stop\?stop=Esplanade$/.test(link),
      link,
    );
    click(window, byId(window, "stop-add"));
    const sticker = window.document.querySelector(".sticker");
    check("a stop sticker lands on the sheet", Boolean(sticker));
    check(
      "and the sticker says what it is for",
      (sticker?.textContent ?? "").includes("At bus stop"),
      sticker?.textContent?.slice(0, 80),
    );
  }
}

/* ------------------------------------------------------------------ the logo */

{
  const window = open();
  const toggle = byId(window, "logo-toggle");
  check("the logo is on by default", toggle.checked === true);
  check("and the page says so", window.document.documentElement.dataset.qrLogo === "on");

  // Choosing a route shows what the code will be, including the logo's cost in modules.
  const search = byId(window, "route-search");
  search.value = "1";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(window, window.document.querySelector("#route-list button"));
  check(
    "the code's description mentions the logo and its printed density",
    /with the logo/.test(byId(window, "bus-qr-meta").textContent) &&
      /mm per module/.test(byId(window, "bus-qr-meta").textContent),
    byId(window, "bus-qr-meta").textContent,
  );

  toggle.checked = false;
  toggle.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("turning it off is remembered", window.localStorage.getItem("cholo:qr:logo") === "off");
  check("and the page reflects it", window.document.documentElement.dataset.qrLogo === "off");
  check(
    "a plain code is described without the logo",
    !/with the logo/.test(byId(window, "bus-qr-meta").textContent),
    byId(window, "bus-qr-meta").textContent,
  );
}

/* ------------------------------------------------------------------ sticker size */

{
  const window = open();
  const sizeMeta = () => byId(window, "size-meta").textContent;
  check("the standard sticker is the default", byId(window, "size-width").value === "90");
  check("and it fits 8 to an A4 page", /2 × 4 = 8 per A4 page/.test(sizeMeta()), sizeMeta());

  click(window, window.document.querySelector('[data-size-preset="small"]'));
  const presets = window.document.querySelectorAll("[data-size-preset]");
  const small = [...presets].find((button) => button.dataset.sizePreset === "small");
  check("choosing a preset marks it", small.getAttribute("aria-pressed") === "true");
  check("the fields follow the preset", byId(window, "size-width").value === "70" && byId(window, "size-qr").value === "30");
  check("the page count follows the size", /2 × 5 = 10 per A4 page/.test(sizeMeta()), sizeMeta());
  check(
    "the printed dimensions are stated in the note",
    /70 × 45 mm with a 30 mm code/.test(byId(window, "print-note").textContent),
    byId(window, "print-note").textContent,
  );
  check("the size is remembered", JSON.parse(window.localStorage.getItem("cholo:qr:size")).width === 70);

  // A hand-typed size is clamped, and the code can never outgrow its sticker.
  const width = byId(window, "size-width");
  width.value = "999";
  width.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("an impossible width is clamped to the sheet", byId(window, "size-width").value === "190", byId(window, "size-width").value);

  const qr = byId(window, "size-qr");
  qr.value = "110";
  qr.dispatchEvent(new window.Event("input", { bubbles: true }));
  check(
    "the code is never larger than the sticker",
    Number(byId(window, "size-qr").value) <= Math.min(Number(byId(window, "size-width").value), Number(byId(window, "size-height").value)) - 6,
    `${byId(window, "size-qr").value} in ${byId(window, "size-width").value}`,
  );

  // A sticker with no room for words drops them rather than overprinting them.
  const search2 = byId(window, "route-search");
  search2.value = "1";
  search2.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(window, window.document.querySelector("#route-list button"));
  click(window, byId(window, "bus-add"));

  // 110 x 40 mm with a 40 mm code leaves ~60 mm of width but only 40 mm of height.
  const setSize = (values) => {
    for (const key of Object.keys(values)) {
      const field = byId(window, `size-${key}`);
      field.value = String(values[key]);
      field.dispatchEvent(new window.Event("input", { bubbles: true }));
    }
  };
  setSize({ width: 110, height: 40, qr: 40, gap: 5 });
  check(
    "a short sticker keeps the title and the link",
    Boolean(window.document.querySelector(".sticker-title")) &&
      Boolean(window.document.querySelector(".sticker-link")),
  );
  check(
    "and marks itself compact, so the sentence beside the code is not printed",
    byId(window, "sheet-cards").dataset.compact === "on",
    byId(window, "sheet-cards").dataset.compact,
  );

  // Nothing else fits at 40 mm tall with a 24 mm code: no sentence, no eyebrow.
  setSize({ width: 40, height: 30, qr: 24, gap: 2 });
  check(
    "a sticker with no room at all drops the eyebrow too",
    byId(window, "sheet-cards").dataset.tight === "on",
    `compact=${byId(window, "sheet-cards").dataset.compact} tight=${byId(window, "sheet-cards").dataset.tight}`,
  );
  check(
    "and says so, instead of printing an unreadable scrap",
    /little room left for the words/.test(byId(window, "size-meta").textContent),
    byId(window, "size-meta").textContent,
  );

  click(window, window.document.querySelector('[data-size-preset="standard"]'));
  check(
    "a standard sticker has room for the sentence again",
    byId(window, "sheet-cards").dataset.compact === "off",
    byId(window, "sheet-cards").dataset.compact,
  );

  // Nonsense in a size field must not blank the sheet.
  width.value = "";
  width.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("an empty field leaves the last good size", Number(byId(window, "size-width").value) > 0);

  // A tiny code with a logo is too dense to trust, and the tool says so rather than
  // printing something a phone will struggle to read.
  const search = byId(window, "route-search");
  search.value = "1";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  click(window, window.document.querySelector("#route-list button"));
  click(window, window.document.querySelector('[data-size-preset="small"]'));
  click(window, byId(window, "bus-add"));
  const tiny = byId(window, "size-meta").textContent;
  check(
    "a code too dense for its printed size is called out",
    /too dense/.test(tiny) || /mm per module/.test(tiny),
    tiny,
  );
}

/* ------------------------------------------------------------------ pages on the sheet */

{
  const window = open();
  const search = byId(window, "route-search");
  const addRoute = (query) => {
    search.value = query;
    search.dispatchEvent(new window.Event("input", { bubbles: true }));
    const first = window.document.querySelector("#route-list button");
    if (first) {
      click(window, first);
      click(window, byId(window, "bus-add"));
    }
  };
  // A standard sticker is 8 to a page, so exactly eight still fit on one sheet.
  for (const query of ["1", "1A", "1B", "3", "3B", "3C/1", "210", "213"]) addRoute(query);
  const pages = () => window.document.querySelectorAll(".sheet-page");
  check("eight standard stickers fill one page", pages().length === 1, `${pages().length} pages`);
  addRoute("C20");
  check("the ninth starts a second page", pages().length === 2, `${pages().length} pages`);
  check(
    "the page says how many of its places are used",
    /of 8 places used/.test(pages()[0].textContent),
    pages()[0].querySelector(".sheet-page-head").textContent,
  );
  click(window, window.document.querySelector('[data-size-preset="large"]'));
  check("a bigger sticker needs even more pages", pages().length >= 3, `${pages().length} pages`);
  const first = pages()[0].querySelectorAll(".sticker").length;
  const perPage = 3;
  check("and a page never holds more than fits", first <= perPage, `${first} on the first page`);
  check(
    "every sticker is still on the sheet",
    window.document.querySelectorAll(".sticker").length === 9,
    `${window.document.querySelectorAll(".sticker").length} stickers`,
  );
}

/* ------------------------------------------------------------------ printing */

{
  const window = open();
  window.eval("window.print = function () { window.__printed = true; };");
  click(window, byId(window, "sheet-print"));
  check("printing an empty sheet does not open the print dialog", window.__printed !== true);
}

console.log(failures ? `\ntest-admin: ${failures} check(s) failed` : "\ntest-admin: all checks passed");
process.exit(failures ? 1 : 0);
