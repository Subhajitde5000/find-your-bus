#!/usr/bin/env node
/**
 * Prove the sticker maker's QR codes actually decode — with and without the logo.
 *
 * A sticker that cannot be scanned is worse than no sticker, and this tool is outside
 * the website's test suite, so it checks itself: generate a code with the vendored
 * encoder, rasterise it exactly as the printed sticker is drawn (same white plate, same
 * mark geometry, from `qr-admin/logo.js`), and read it back with the same decoder the
 * website's scanner uses (jsQR).
 *
 * The logo is the interesting case. It punches a hole in the pattern, so the encodings
 * are generated at level H and the hole is kept small; this script measures the result at
 * real print densities (300 dpi at the sizes the tool offers) rather than trusting it.
 *
 *   node qr-admin/scripts/verify-qr.mjs
 *
 * Exits non-zero if any code fails. No network, no dependencies beyond the repository.
 */

import { createRequire } from "node:module";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const require = createRequire(join(ROOT, "fontend/package.json"));
const jsQR = require("jsqr");
const qrcode = createRequire(import.meta.url)(join(ROOT, "qr-admin/vendor/qrcode.js"));

// logo.js is a plain browser script; loaded here it puts its spec on globalThis.
require(join(ROOT, "qr-admin/logo.js"));
const LOGO = globalThis.CHOLO_LOGO;

const QUIET = 4;
const DPI = 300;
/** The smallest code the tool prints by default, and the standard one. */
const PRINT_MM = [30, 40];
/** Below this the tool warns that the code is too dense to rely on. */
const MIN_MM_PER_MODULE = 0.35;

const mmToPx = (mm) => Math.round((mm / 25.4) * DPI);

function fillRect(rgba, size, x, y, width, height, [r, g, b]) {
  const left = Math.max(0, Math.round(x));
  const top = Math.max(0, Math.round(y));
  const right = Math.min(size, Math.round(x + width));
  const bottom = Math.min(size, Math.round(y + height));
  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      const index = (py * size + px) * 4;
      rgba[index] = r;
      rgba[index + 1] = g;
      rgba[index + 2] = b;
      rgba[index + 3] = 255;
    }
  }
}

const rgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** The same geometry as drawLogo() in qr-admin.js, in pixels. */
function drawLogo(rgba, size) {
  const pad = size * LOGO.padRatio;
  const box = size * LOGO.boxRatio;
  const origin = (size - pad) / 2;
  // The pad is a rounded square in the browser. Ignoring the rounding here makes the
  // hole slightly bigger, which is the conservative direction for a decode test.
  fillRect(rgba, size, origin, origin, pad, pad, [255, 255, 255]);

  const scale = box / LOGO.viewBox;
  const left = (size - box) / 2;
  const top = (size - box) / 2;
  for (const shape of LOGO.shapes) {
    const colour = rgb(shape.fill);
    if (shape.rect) {
      const [x, y, width, height] = shape.rect;
      fillRect(rgba, size, left + x * scale, top + y * scale, width * scale, height * scale, colour);
    } else if (shape.circle) {
      const [cx, cy, radius] = shape.circle;
      fillRect(rgba, size, left + (cx - radius) * scale, top + (cy - radius) * scale, radius * 2 * scale, radius * 2 * scale, colour);
    }
  }
}

/**
 * Rasterise a code the way the sticker draws it.
 *
 * `scale` is pixels per module; `logo` draws the plate and the mark over the finished
 * pattern, exactly as the canvas does.
 */
function rasterise(text, { scale = 6, logo = false, level = logo ? LOGO.level : "M" } = {}) {
  const code = qrcode(0, level);
  code.addData(text);
  code.make();
  const modules = code.getModuleCount();
  const size = (modules + QUIET * 2) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      for (let y = 0; y < scale; y += 1) {
        for (let x = 0; x < scale; x += 1) {
          const px = (column + QUIET) * scale + x;
          const py = (row + QUIET) * scale + y;
          const index = (py * size + px) * 4;
          rgba[index] = 11;
          rgba[index + 1] = 31;
          rgba[index + 2] = 23;
          rgba[index + 3] = 255;
        }
      }
    }
  }
  if (logo) drawLogo(rgba, size);
  return { rgba, size, modules, mmPerModule: null };
}

const origin = "https://cholo.example";
const samples = [
  `${origin}/on-bus?route=1`,
  `${origin}/on-bus?route=S12D`,
  `${origin}/on-bus?route=AC-12+%28Shapooji+Housing+%28Sukho+Brishti%29+-+Howrah+Railway+Station%29`,
  `${origin}/on-bus?route=230&bus=WB+04+A+1234`,
  `${origin}/stop?stop=Esplanade`,
  `${origin}/stop?stop=Ahiritola+%28Rajabazar%29`,
  `${origin}/stop?stop=Calcutta+Leather+Complex+%28Covers+All+3+Gates%29`,
  "https://cholo.in/on-bus?route=1",
];

let failures = 0;

function report(ok, label, detail) {
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
}

/* ---------------------------------------------------------------- plain codes */

console.log("Without the logo (level M):");
for (const text of samples) {
  const { rgba, size, modules } = rasterise(text);
  const decoded = jsQR(rgba, size, size);
  report(decoded?.data === text, `${String(modules).padStart(2)}x${modules}  ${String(text.length).padStart(3)} chars  ${text}`, decoded?.data === text ? "" : `decoded: ${decoded?.data ?? "nothing"}`);
}

/* ---------------------------------------------------------------- with the logo */

console.log(`\nWith the logo (level ${LOGO.level}, ${Math.round(LOGO.padRatio * 100)}% white plate, 300 dpi):`);
for (const mm of PRINT_MM) {
  const pixels = mmToPx(mm);
  console.log(`\n  printed at ${mm} mm = ${pixels} px:`);
  for (const text of samples) {
    // The scale the browser would use: whole modules inside the requested pixels.
    const probe = rasterise(text, { logo: true });
    const scale = Math.max(1, Math.floor(pixels / (probe.modules + QUIET * 2)));
    const { rgba, size, modules } = rasterise(text, { logo: true, scale });
    const decoded = jsQR(rgba, size, size);
    const mmPerModule = mm / (modules + QUIET * 2);
    const ok = decoded?.data === text;
    const dense = mmPerModule < MIN_MM_PER_MODULE ? "  (below the tool's own density warning)" : "";
    report(ok, `${String(modules).padStart(2)}x${modules}  ${mmPerModule.toFixed(2)} mm/module  ${text.slice(origin.length)}`, ok ? dense : `decoded: ${decoded?.data ?? "nothing"}`);
  }
}

/* ---------------------------------------------------------------- logo vs plain */

{
  const text = `${origin}/stop?stop=Esplanade`;
  const plain = rasterise(text);
  const withLogo = rasterise(text, { logo: true });
  report(
    withLogo.modules > plain.modules,
    `the logo raises the correction level (${plain.modules} -> ${withLogo.modules} modules)`,
    "level H has to be denser; that is why the density warning exists",
  );
}

if (failures) {
  console.error(`\nverify-qr: ${failures} code${failures === 1 ? "" : "s"} did not read back`);
  process.exit(1);
}
console.log(`\nverify-qr: all ${samples.length} links decode back to exactly the link they encode, with and without the logo`);
