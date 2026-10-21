/*
 * Tests for the all-stops map geometry and the map style helpers.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CITY_WINDOW, inCityWindow, NETWORK_SIZE, networkPosition, networkXY, pathOf, routeLine } from "@/lib/networkMap";
import { nextMapStyle, resolveMapStyle, isMapStyle } from "@/lib/mapStyle";
import { allRoadLegs } from "@/lib/routeGeometry";
import type { Position } from "@/lib/geo";

describe("network projection", () => {
  it("puts the south-west corner at the bottom left and the north-east at the top right", () => {
    const sw = networkXY({ lat: CITY_WINDOW.minLat, lng: CITY_WINDOW.minLng });
    const ne = networkXY({ lat: CITY_WINDOW.maxLat, lng: CITY_WINDOW.maxLng });
    assert.ok(sw.x < ne.x);
    assert.ok(sw.y > ne.y, "north is up");
    assert.ok(ne.x <= NETWORK_SIZE.width && sw.y <= NETWORK_SIZE.height);
  });

  it("round-trips a position", () => {
    const here = { lat: 22.5726, lng: 88.3639 };
    const back = networkPosition(networkXY(here));
    assert.ok(Math.abs(back.lat - here.lat) < 1e-9 && Math.abs(back.lng - here.lng) < 1e-9);
  });

  it("knows what is inside the city window", () => {
    assert.ok(inCityWindow({ lat: 22.5726, lng: 88.3639 }));
    assert.ok(!inCityWindow({ lat: 26.7, lng: 88.4 }));
  });

  it("scales equally in both directions, so a square on the ground is a square on the map", () => {
    const a = networkXY({ lat: 22.5, lng: 88.3 });
    const dLat = networkXY({ lat: 22.51, lng: 88.3 });
    const dLng = networkXY({ lat: 22.5, lng: 88.3 + 0.01 * (110.574 / (111.32 * Math.cos(22.575 * Math.PI / 180))) });
    assert.ok(Math.abs(Math.abs(dLat.y - a.y) - Math.abs(dLng.x - a.x)) < 0.05);
  });
});

describe("path building", () => {
  it("writes one subpath per line and skips a line of one point", () => {
    const line: Position[] = [{ lat: 22.5, lng: 88.3 }, { lat: 22.51, lng: 88.31 }];
    const d = pathOf([line, [{ lat: 22.5, lng: 88.3 }], line]);
    assert.equal((d.match(/M/g) ?? []).length, 2);
    assert.match(d, /^M[\d.]+ [\d.]+L[\d.]+ [\d.]+M/);
  });
});

describe("route line", () => {
  const places: Record<string, Position> = {
    A: { lat: 22.5, lng: 88.3 },
    B: { lat: 22.51, lng: 88.3 },
    C: { lat: 22.52, lng: 88.3 },
  };
  const at = (name: string) => places[name] ?? null;

  it("follows a road shape where there is one and a straight line where there is not", () => {
    const road = (from: string, to: string) =>
      from === "A" && to === "B" ? [places.A, { lat: 22.505, lng: 88.302 }, places.B] : null;
    const result = routeLine(["A", "B", "C"], road, at);
    assert.equal(result.roadLegs, 1);
    assert.equal(result.straightLegs, 1);
    assert.equal(result.line.length, 4);
  });

  it("joins across a stop that has no position", () => {
    const result = routeLine(["A", "Unknown", "C"], () => null, at);
    assert.equal(result.straightLegs, 1);
    assert.deepEqual(result.line, [places.A, places.C]);
  });

  it("does not draw a leg from a stop to itself", () => {
    assert.equal(routeLine(["A", "A", "B"], () => null, at).straightLegs, 1);
  });
});

describe("road legs", () => {
  it("lists each bundled road once, however many directions exist", () => {
    const keys = allRoadLegs().map((leg) => leg.key);
    for (const key of keys) {
      const [from, to] = key.split("|");
      if (from > to) assert.ok(!keys.includes(`${to}|${from}`), `${key} listed twice`);
    }
  });
});

describe("map style", () => {
  it("cycles auto, day, night", () => {
    assert.equal(nextMapStyle("auto"), "day");
    assert.equal(nextMapStyle("day"), "night");
    assert.equal(nextMapStyle("night"), "auto");
  });

  it("resolves auto against the device", () => {
    assert.equal(resolveMapStyle("auto", true), "night");
    assert.equal(resolveMapStyle("auto", false), "day");
    assert.equal(resolveMapStyle("day", true), "day");
    assert.equal(resolveMapStyle("night", false), "night");
  });

  it("rejects an unknown stored value", () => {
    assert.ok(isMapStyle("night"));
    assert.ok(!isMapStyle("sepia"));
  });
});
