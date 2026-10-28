/*
 * The site's light / dark appearance.
 *
 * The bug these guard against: the stop map page used to be the only page that never
 * applied the stored theme, so in a dark appearance the map went night while the page
 * around it stayed light. Every route now paints from the same choice, and these tests
 * pin down the rules that choice follows.
 *
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTheme,
  currentTheme,
  isTheme,
  otherTheme,
  preferredTheme,
  readStoredTheme,
  setTheme,
  storeTheme,
  themeFromSystem,
  THEME_BOOTSTRAP,
  THEME_EVENT,
  THEME_KEY,
} from "@/lib/theme";

describe("the theme choice", () => {
  it("only accepts the two themes", () => {
    assert.equal(isTheme("light"), true);
    assert.equal(isTheme("dark"), true);
    assert.equal(isTheme("system"), false);
    assert.equal(isTheme(null), false);
    assert.equal(isTheme(undefined), false);
  });

  it("flips between them", () => {
    assert.equal(otherTheme("light"), "dark");
    assert.equal(otherTheme("dark"), "light");
  });

  it("follows the phone when nothing is chosen", () => {
    assert.equal(themeFromSystem(true), "dark");
    assert.equal(themeFromSystem(false), "light");
  });

  it("falls back to light with no browser at all, instead of throwing", () => {
    // This module is imported by the root layout, so it is evaluated during static export
    // too, where there is no window or document.
    assert.equal(readStoredTheme(), null);
    assert.equal(preferredTheme(), "light");
    assert.equal(currentTheme(), "light");
    assert.doesNotThrow(() => applyTheme("dark"));
    assert.doesNotThrow(() => storeTheme("dark"));
  });

  it("reads and reports the theme the page is painting", () => {
    const attributes = new Map<string, string>();
    const storage = new Map<string, string>();
    const events: string[] = [];
    const nativeDarkStates: boolean[] = [];

    const fake = globalThis as unknown as {
      document?: unknown;
      window?: unknown;
    };
    const previous = { document: fake.document, window: fake.window };
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        documentElement: {
          getAttribute: (name: string) => attributes.get(name) ?? null,
          setAttribute: (name: string, value: string) => void attributes.set(name, value),
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => void storage.set(key, value),
        },
        matchMedia: () => ({ matches: false }),
        dispatchEvent: (event: { type: string }) => void events.push(event.type),
        CholoNativeBars: {
          setDarkTheme: (dark: boolean) => void nativeDarkStates.push(dark),
        },
      },
    });

    try {
      assert.equal(readStoredTheme(), null, "nothing stored yet");
      setTheme("dark");
      assert.equal(attributes.get("data-theme"), "dark", "the page paints dark");
      assert.equal(storage.get(THEME_KEY), "dark", "and the choice is remembered");
      assert.deepEqual(events, [THEME_EVENT], "other theme buttons are told");
      assert.deepEqual(nativeDarkStates, [true], "native status/navigation bar icons match dark theme");
      assert.equal(currentTheme(), "dark");
      assert.equal(preferredTheme(), "dark");
      setTheme("light");
      assert.equal(currentTheme(), "light");
      assert.deepEqual(nativeDarkStates, [true, false], "native status/navigation bar icons switch back to light");
    } finally {
      Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: previous.document });
      Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: previous.window });
    }
  });

  it("keeps the pre-paint script in step with the helpers", () => {
    assert.ok(THEME_BOOTSTRAP.includes(THEME_KEY), "the script reads the same stored key");
    assert.ok(THEME_BOOTSTRAP.includes("prefers-color-scheme: dark"), "and follows the phone when nothing is stored");
    assert.ok(THEME_BOOTSTRAP.includes("data-theme"), "and sets the attribute every colour hangs off");
  });
});
