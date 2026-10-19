/*
 * Tests for the map's zoom, pan and label placement. Run with: npm test
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  centreOn,
  clampView,
  fitView,
  MAX_ZOOM,
  MIN_ZOOM,
  panBy,
  placeLabels,
  viewBoxOf,
  viewRect,
  zoomAt,
} from "@/lib/mapView";

const SIZE = { width: 340, height: 200 };
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

describe("view rectangle", () => {
  it("shows the whole drawing at zoom 1", () => {
    assert.equal(viewBoxOf(fitView(SIZE), SIZE), "0 0 340 200");
  });
  it("shows a smaller rectangle as the zoom grows", () => {
    const rect = viewRect({ zoom: 4, cx: 170, cy: 100 }, SIZE);
    assert.ok(near(rect.w, 85) && near(rect.h, 50));
    assert.ok(near(rect.x, 127.5) && near(rect.y, 75));
  });
  it("clamps the zoom to its limits", () => {
    assert.equal(clampView({ zoom: 0.2, cx: 170, cy: 100 }, SIZE).zoom, MIN_ZOOM);
    assert.equal(clampView({ zoom: 99, cx: 170, cy: 100 }, SIZE).zoom, MAX_ZOOM);
  });
  it("never lets the rectangle leave the drawing", () => {
    for (const zoom of [1, 2, 5, 12]) {
      for (const [cx, cy] of [[-500, -500], [9999, 9999], [0, 9999], [170, 100]]) {
        const rect = viewRect({ zoom, cx, cy }, SIZE);
        assert.ok(rect.x >= -1e-9 && rect.y >= -1e-9, `zoom ${zoom}`);
        assert.ok(rect.x + rect.w <= SIZE.width + 1e-9 && rect.y + rect.h <= SIZE.height + 1e-9, `zoom ${zoom}`);
      }
    }
  });
});

describe("zooming", () => {
  it("keeps the point under the anchor fixed", () => {
    const start = { zoom: 2, cx: 170, cy: 100 };
    const anchor = { x: 220, y: 60 };
    const before = viewRect(start, SIZE);
    const after = viewRect(zoomAt(start, SIZE, 2, anchor), SIZE);
    // The anchor sits at the same fraction of the visible rectangle before and after.
    assert.ok(near((anchor.x - before.x) / before.w, (anchor.x - after.x) / after.w, 1e-6));
    assert.ok(near((anchor.y - before.y) / before.h, (anchor.y - after.y) / after.h, 1e-6));
  });
  it("cannot zoom out past the whole drawing or in past the limit", () => {
    assert.equal(zoomAt(fitView(SIZE), SIZE, 0.1, { x: 10, y: 10 }).zoom, MIN_ZOOM);
    let view = fitView(SIZE);
    for (let i = 0; i < 20; i += 1) view = zoomAt(view, SIZE, 2, { x: 100, y: 100 });
    assert.equal(view.zoom, MAX_ZOOM);
  });
  it("zooming in then out by the same factor returns to the start", () => {
    const start = { zoom: 3, cx: 150, cy: 90 };
    const back = zoomAt(zoomAt(start, SIZE, 2, { x: 160, y: 95 }), SIZE, 0.5, { x: 160, y: 95 });
    assert.ok(near(back.zoom, start.zoom) && near(back.cx, start.cx, 1e-6) && near(back.cy, start.cy, 1e-6));
  });
});

describe("panning and following", () => {
  it("drags the picture with the finger", () => {
    const view = panBy({ zoom: 4, cx: 170, cy: 100 }, SIZE, 20, -10);
    assert.ok(near(view.cx, 150) && near(view.cy, 110));
  });
  it("cannot pan the whole drawing at zoom 1", () => {
    const view = panBy(fitView(SIZE), SIZE, 80, 80);
    assert.deepEqual(view, fitView(SIZE));
  });
  it("centres on a point, within the drawing", () => {
    const view = centreOn({ zoom: 4, cx: 170, cy: 100 }, SIZE, { x: 300, y: 20 });
    const rect = viewRect(view, SIZE);
    assert.ok(rect.x + rect.w <= SIZE.width + 1e-9 && rect.y >= -1e-9);
    const mid = centreOn({ zoom: 4, cx: 0, cy: 0 }, SIZE, { x: 170, y: 100 });
    assert.ok(near(mid.cx, 170) && near(mid.cy, 100));
  });
});

describe("label placement", () => {
  const rect = { x: 0, y: 0, w: 340, h: 200 };
  it("drops a label that collides with a more important one", () => {
    const placed = placeLabels(
      [
        { id: "a", x: 100, y: 100, text: "Esplanade", priority: 1 },
        { id: "b", x: 104, y: 102, text: "Dharmatala", priority: 2 },
      ],
      rect, 8.5, 6,
    );
    assert.deepEqual(placed.map((p) => p.id), ["a"]);
  });
  it("keeps labels that are far apart, in priority order", () => {
    const placed = placeLabels(
      [
        { id: "far", x: 20, y: 20, text: "Far", priority: 5 },
        { id: "near", x: 20, y: 150, text: "Near", priority: 1 },
      ],
      rect, 8.5, 6,
    );
    assert.deepEqual(placed.map((p) => p.id), ["near", "far"]);
  });
  it("flips a label that would run off the right edge, and drops one outside the view", () => {
    const placed = placeLabels(
      [
        { id: "edge", x: 330, y: 50, text: "Karunamoyee", priority: 1 },
        { id: "out", x: 500, y: 50, text: "Nowhere", priority: 2 },
      ],
      rect, 8.5, 6,
    );
    assert.deepEqual(placed.map((p) => p.id), ["edge"]);
    assert.equal(placed[0].anchor, "end");
    assert.ok(placed[0].tx < 330);
  });
});
