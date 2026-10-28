/*
 * Tests for the QR link format: what a sticker contains, and what the scanner accepts.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normaliseBusRegistration,
  normaliseOrigin,
  normaliseRouteNumber,
  onBusLink,
  parseQrValue,
  qrFailureMessage,
  qrPath,
  SITE_ORIGIN,
  stopLink,
} from "@/lib/qrLinks";

const ORIGIN = "https://pathsathi.example";

describe("qr links", () => {
  it("builds an on-bus link from a route", () => {
    assert.equal(onBusLink("1", null, ORIGIN), "https://pathsathi.example/on-bus?route=1");
    assert.equal(qrPath({ kind: "on-bus", route: "AC5", bus: null }), "/on-bus?route=AC5");
  });

  it("carries a bus registration when a sticker names one", () => {
    assert.equal(onBusLink("1", "WB04A1234", ORIGIN), "https://pathsathi.example/on-bus?route=1&bus=WB+04+A+1234");
    assert.equal(onBusLink("1", "wb-04-af-5678", ORIGIN), "https://pathsathi.example/on-bus?route=1&bus=WB+04+AF+5678");
  });

  it("ignores a bus registration that cannot be one", () => {
    assert.equal(normaliseBusRegistration("hello"), null);
    assert.equal(normaliseBusRegistration("WB04A1234"), "WB 04 A 1234");
    assert.equal(onBusLink("1", "not-a-bus", ORIGIN), "https://pathsathi.example/on-bus?route=1");
  });

  it("builds a stop link for a name with brackets and a slash", () => {
    assert.equal(
      stopLink("Ahiritola (Rajabazar)", ORIGIN),
      "https://pathsathi.example/stop?stop=Ahiritola+%28Rajabazar%29",
    );
    assert.equal(
      stopLink("B.B.D. Bagh", ORIGIN),
      "https://pathsathi.example/stop?stop=B.B.D.+Bagh",
    );
  });

  it("strips a trailing slash from the configured origin", () => {
    assert.equal(normaliseOrigin("https://pathsathi.in///"), "https://pathsathi.in");
    assert.equal(onBusLink("1", null, "https://pathsathi.in/"), "https://pathsathi.in/on-bus?route=1");
  });

  it("keeps a long operator route number intact", () => {
    const long = "AC-12 (Shapooji Housing (Sukho Brishti) - Howrah Railway Station)";
    assert.equal(normaliseRouteNumber(long), long);
    const parsed = parseQrValue(onBusLink(long, null, ORIGIN), ORIGIN);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.ok && parsed.target.kind === "on-bus" ? parsed.target.route : null, long);
  });
});

describe("scanning a value", () => {
  it("reads an absolute link on the configured site", () => {
    const parsed = parseQrValue(`${ORIGIN}/on-bus?route=230`, ORIGIN);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.ok ? parsed.target : null, { kind: "on-bus", route: "230", bus: null });
    assert.equal(parsed.ok ? parsed.path : "", "/on-bus?route=230");
  });

  it("reads the www alias and plain http", () => {
    assert.equal(parseQrValue("https://www.pathsathi.example/on-bus?route=1", ORIGIN).ok, true);
    assert.equal(parseQrValue("http://pathsathi.example/on-bus?route=1", ORIGIN).ok, true);
  });

  it("reads a bare path, a link without a scheme, and stray whitespace", () => {
    assert.equal(parseQrValue("/on-bus?route=1", ORIGIN).ok, true);
    assert.equal(parseQrValue("pathsathi.example/on-bus?route=1", ORIGIN).ok, true);
    const padded = parseQrValue("  \n https://pathsathi.example/stop?stop=Esplanade \n ", ORIGIN);
    assert.equal(padded.ok, true);
    assert.equal(padded.ok ? padded.path : "", "/stop?stop=Esplanade");
  });

  it("tolerates a trailing slash and a different case in the path", () => {
    assert.equal(parseQrValue(`${ORIGIN}/On-Bus/?route=1`, ORIGIN).ok, true);
  });

  it("never navigates to another website", () => {
    const parsed = parseQrValue("https://evil.example/on-bus?route=1", ORIGIN);
    assert.equal(parsed.ok, false);
    assert.equal(!parsed.ok && parsed.reason, "other-website");
    assert.equal(parseQrValue("javascript:alert(1)", ORIGIN).ok, false);
  });

  it("rejects a link that is ours but is not a bus or stop code", () => {
    const parsed = parseQrValue(`${ORIGIN}/ride?route=1`, ORIGIN);
    assert.equal(parsed.ok, false);
    assert.equal(!parsed.ok && parsed.reason, "unknown-page");
  });

  it("rejects a bus code with no route and a stop code with no stop", () => {
    assert.equal(!parseQrValue(`${ORIGIN}/on-bus?route=`, ORIGIN).ok, true);
    assert.equal(!parseQrValue(`${ORIGIN}/stop?stop=%20%20`, ORIGIN).ok, true);
  });

  it("keeps a bus registration from the sticker and warns about a bad one", () => {
    const good = parseQrValue(`${ORIGIN}/on-bus?route=1&bus=WB04A1234`, ORIGIN);
    assert.equal(good.ok && good.target.kind === "on-bus" ? good.target.bus : null, "WB 04 A 1234");
    const bad = parseQrValue(`${ORIGIN}/on-bus?route=1&bus=42`, ORIGIN);
    assert.equal(bad.ok, true);
    assert.equal(bad.ok ? bad.warnings.length : 0, 1);
    assert.equal(bad.ok && bad.target.kind === "on-bus" ? bad.target.bus : "x", null);
  });

  it("round-trips every kind through its own link", () => {
    for (const link of [
      onBusLink("S12D", null, ORIGIN),
      onBusLink("12 (Shuttle)", "WB 04 A 1234", ORIGIN),
      stopLink("Ultadanga / HUDCO", ORIGIN),
      stopLink("Calcutta Leather Complex (Covers All 3 Gates)", ORIGIN),
    ]) {
      const parsed = parseQrValue(link, ORIGIN);
      assert.equal(parsed.ok, true, link);
      assert.equal(parsed.ok ? parsed.path : "", qrPath(parsed.ok ? parsed.target : { kind: "stop", stop: "x" }));
    }
  });

  it("has a sentence for every failure", () => {
    for (const reason of ["empty", "not-a-link", "other-website", "unknown-page", "missing-route", "missing-stop"] as const) {
      assert.ok(qrFailureMessage(reason).length > 10);
    }
  });

  it("uses the documented placeholder origin until the real domain is set", () => {
    // scripts/set_qr_domain.mjs rewrites this constant; the test only guards the shape.
    assert.match(SITE_ORIGIN, /^https:\/\/[a-z0-9.-]+$/);
  });
});
