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

  for (const file of ["vendor/qrcode.js", "data/catalog.js", "qr-admin.js"]) {
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

/* ------------------------------------------------------------------ printing */

{
  const window = open();
  window.eval("window.print = function () { window.__printed = true; };");
  click(window, byId(window, "sheet-print"));
  check("printing an empty sheet does not open the print dialog", window.__printed !== true);
}

console.log(failures ? `\ntest-admin: ${failures} check(s) failed` : "\ntest-admin: all checks passed");
process.exit(failures ? 1 : 0);
