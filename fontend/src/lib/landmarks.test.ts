/*
 * Tests for the landmark layer: reading is strict, and the bundled file is sound.
 * Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundsOf, KIND_LABEL, LANDMARK_POINTS, LANDMARK_SHAPES, pointsIn, readLandmarks, shapesIn } from "@/lib/landmarks";
import { stopPosition } from "@/lib/coords";

describe("reading landmarks", () => {
  it("keeps good features and drops bad ones", () => {
    const { points, shapes } = readLandmarks({
      points: [
        { id: "a", name: "Howrah Bridge", kind: "bridge", lat: 22.585, lng: 88.347, source: "stop" },
        { id: "b", name: "No kind", kind: "spaceport", lat: 22.5, lng: 88.3 },
        { id: "c", name: "Bad coordinate", kind: "bridge", lat: 99, lng: 88.3 },
        { id: "d", name: "Outside the service area", kind: "bridge", lat: 10, lng: 10 },
        { id: "a", name: "Duplicate id", kind: "bridge", lat: 22.5, lng: 88.3 },
        { id: "e", name: "", kind: "bridge", lat: 22.5, lng: 88.3 },
        { name: "No id", kind: "bridge", lat: 22.5, lng: 88.3 },
      ],
      shapes: [
        { id: "r", name: "River", kind: "river", closed: false, points: [[22.5, 88.3], [22.6, 88.31]], source: "osm" },
        { id: "s", name: "One point", kind: "river", points: [[22.5, 88.3]] },
        { id: "t", name: "Bad vertex", kind: "river", points: [[22.5, 88.3], [200, 88.3]] },
        { id: "u", name: "Not a pair", kind: "river", points: [[22.5, 88.3], "x"] },
        { id: "v", name: "Short outline", kind: "landmark", closed: true, points: [[22.5, 88.3], [22.6, 88.3], [22.6, 88.4]] },
      ],
    });
    assert.deepEqual(points.map((p) => p.id), ["a"]);
    assert.deepEqual(shapes.map((s) => s.id), ["r", "v"]);
    // three points cannot be a closed outline, so it is drawn as a line
    assert.equal(shapes.find((s) => s.id === "v")?.closed, false);
  });

  it("copes with missing or malformed input", () => {
    assert.deepEqual(readLandmarks(null), { points: [], shapes: [] });
    assert.deepEqual(readLandmarks({ points: "x", shapes: 3 }), { points: [], shapes: [] });
  });

  it("finds features in a box, including a long river that only crosses it", () => {
    const { points, shapes } = readLandmarks({
      points: [
        { id: "in", name: "In", kind: "bridge", lat: 22.5, lng: 88.3 },
        { id: "out", name: "Out", kind: "bridge", lat: 22.9, lng: 88.3 },
      ],
      shapes: [{ id: "river", name: "River", kind: "river", points: [[22.3, 88.3], [22.8, 88.3]] }],
    });
    const box = { minLat: 22.45, maxLat: 22.55, minLng: 88.25, maxLng: 88.35 };
    assert.deepEqual(pointsIn(points, box).map((p) => p.id), ["in"]);
    assert.deepEqual(shapesIn(shapes, box).map((s) => s.id), ["river"]);
  });

  it("computes bounds", () => {
    assert.equal(boundsOf([]), null);
    assert.deepEqual(boundsOf([{ lat: 1, lng: 2 }, { lat: 3, lng: 0 }]), { minLat: 1, maxLat: 3, minLng: 0, maxLng: 2 });
  });
});

describe("the bundled landmarks", () => {
  it("has a label for every kind it uses", () => {
    for (const item of [...LANDMARK_POINTS, ...LANDMARK_SHAPES]) assert.ok(KIND_LABEL[item.kind], item.id);
  });

  it("places every stop-derived landmark exactly where its stop is, and never invents one", () => {
    const fromStops = LANDMARK_POINTS.filter((p) => p.source === "stop");
    assert.ok(fromStops.length > 0);
    for (const p of fromStops) {
      const stop = stopPosition(p.name);
      assert.ok(stop, `${p.name} must be a located stop`);
      assert.ok(Math.abs(stop.lat - p.lat) < 1e-4 && Math.abs(stop.lng - p.lng) < 1e-4, `${p.name} moved`);
    }
  });

  it("marks any OpenStreetMap shape as such", () => {
    for (const shape of LANDMARK_SHAPES) assert.equal(shape.source, "osm");
  });
});
