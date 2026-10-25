/*
 * Tests for the QR links: building them, reading them back, and resolving a sticker by
 * hand. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBusQrUrl,
  buildStopQrUrl,
  busQrPath,
  isQrLink,
  normaliseOrigin,
  qrHref,
  resolveQrInput,
  shortCodeFor,
  stopQrPath,
} from "@/lib/qr";

describe("building QR links", () => {
  it("puts the route in a short query", () => {
    assert.equal(buildBusQrUrl("https://cholo.in", { route: "230" }), "https://cholo.in/qr/bus?r=230");
    assert.equal(buildBusQrUrl("https://cholo.in/", { route: "230", direction: "return" }), "https://cholo.in/qr/bus?r=230&d=r");
  });

  it("encodes route numbers that contain spaces, brackets or slashes", () => {
    const route = "12C/1 (Shibrampur - Howrah Railway Station)";
    const url = buildBusQrUrl("https://cholo.in", { route });
    assert.ok(!url.includes(" "));
    assert.deepEqual(resolveQrInput(url), {
      kind: "bus",
      route,
      direction: null,
      busReg: null,
      boarding: null,
      destination: null,
    });
  });

  it("encodes a stop name", () => {
    const url = buildStopQrUrl("https://cholo.in", "Esplanade & Curzon Park");
    assert.equal(resolveQrInput(url)?.kind, "stop");
    assert.equal((resolveQrInput(url) as { stop: string }).stop, "Esplanade & Curzon Park");
  });

  it("keeps the bus registration and an optional destination", () => {
    const url = buildBusQrUrl("https://cholo.in", {
      route: "1",
      direction: "outbound",
      busReg: "WB 12 AB 3456",
      boarding: "Exide",
      destination: "Garia",
    });
    const target = resolveQrInput(url);
    assert.ok(target && target.kind === "bus");
    assert.equal(target.route, "1");
    assert.equal(target.direction, "outbound");
    assert.equal(target.busReg, "WB 12 AB 3456");
    assert.equal(target.boarding, "Exide");
    assert.equal(target.destination, "Garia");
  });

  it("strips a trailing slash from the origin and nothing else", () => {
    assert.equal(normaliseOrigin("https://cholo.in///"), "https://cholo.in");
    assert.equal(normaliseOrigin("https://example.com/bus-site/"), "https://example.com/bus-site");
    assert.equal(busQrPath({ route: "1" }), "/qr/bus?r=1");
    assert.equal(stopQrPath("Garia"), "/qr/stop?s=Garia");
  });
});

describe("reading a sticker", () => {
  it("accepts the same link from any domain, so a staging site works", () => {
    assert.equal(resolveQrInput("https://staging.example.org/qr/bus?r=45")?.kind, "bus");
  });

  it("accepts a relative path", () => {
    const target = resolveQrInput("/qr/stop?s=Garia");
    assert.ok(target && target.kind === "stop" && target.stop === "Garia");
  });

  it("still understands the cholo: scheme", () => {
    const bus = resolveQrInput("cholo://bus?r=230&d=o");
    assert.ok(bus && bus.kind === "bus" && bus.route === "230" && bus.direction === "outbound");
    const stop = resolveQrInput("cholo://stop?s=Esplanade");
    assert.ok(stop && stop.kind === "stop" && stop.stop === "Esplanade");
  });

  it("rejects links that are not stickers", () => {
    assert.equal(resolveQrInput("https://cholo.in/map"), null);
    assert.equal(resolveQrInput("https://cholo.in/qr/bus"), null, "a bus link with no route is not a bus");
    assert.equal(resolveQrInput("https://cholo.in/qr/stop"), null);
    assert.equal(resolveQrInput("https://cholo.in/qr/bus?r="), null);
    assert.equal(resolveQrInput(""), null);
    assert.equal(resolveQrInput("   "), null);
  });

  it("reads the short code printed under a sticker", () => {
    assert.deepEqual(resolveQrInput("BUS 230"), {
      kind: "bus",
      route: "230",
      direction: null,
      busReg: null,
      boarding: null,
      destination: null,
    });
    assert.deepEqual(resolveQrInput("b:12C/1A R"), {
      kind: "bus",
      route: "12C/1A",
      direction: "return",
      busReg: null,
      boarding: null,
      destination: null,
    });
    const stop = resolveQrInput("STOP Esplanade");
    assert.ok(stop && stop.kind === "stop" && stop.stop === "Esplanade");
  });

  it("resolves bare text against the directory, only when it is unambiguous", () => {
    const route = resolveQrInput("230");
    assert.ok(route && route.kind === "bus" && route.route === "230");
    const stop = resolveQrInput("Esplanade");
    assert.ok(stop && stop.kind === "stop" && stop.stop === "Esplanade");
    assert.equal(resolveQrInput("not a bus and not a stop"), null);
  });

  it("prints a short code that reads back to the same target", () => {
    const target = { kind: "bus" as const, route: "12C/1A", direction: "return" as const, busReg: null, boarding: null, destination: null };
    const code = shortCodeFor(target);
    assert.equal(code, "BUS 12C/1A R");
    const back = resolveQrInput(code);
    assert.ok(back && back.kind === "bus" && back.route === "12C/1A" && back.direction === "return");
  });

  it("gives each target the href the app should navigate to", () => {
    assert.equal(qrHref({ kind: "stop", stop: "Garia" }), "/qr/stop?s=Garia");
    assert.equal(
      qrHref({ kind: "bus", route: "230", direction: "return", busReg: null, boarding: null, destination: null }),
      "/qr/bus?r=230&d=r",
    );
  });

  it("recognises a QR link whatever host it uses", () => {
    assert.equal(isQrLink("https://cholo.in/qr/bus?r=1"), true);
    assert.equal(isQrLink("https://cholo.in/qr/stop/"), true);
    assert.equal(isQrLink("https://cholo.in/ride?route=1"), false);
    assert.equal(isQrLink("not a url"), false);
  });
});
