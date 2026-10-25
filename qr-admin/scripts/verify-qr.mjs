#!/usr/bin/env node
/**
 * Prove the sticker maker's QR codes actually decode.
 *
 * A sticker that cannot be scanned is worse than no sticker, and this tool is outside
 * the website's test suite, so it checks itself: generate a code with the vendored
 * encoder, rasterise it exactly as the printed sticker is drawn, and read it back with
 * the same decoder the website's scanner uses (jsQR).
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

const QUIET = 4;
const SCALE = 6;

function rasterise(text) {
  const code = qrcode(0, "M");
  code.addData(text);
  code.make();
  const modules = code.getModuleCount();
  const size = (modules + QUIET * 2) * SCALE;
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let row = 0; row < modules; row += 1) {
    for (let column = 0; column < modules; column += 1) {
      if (!code.isDark(row, column)) continue;
      for (let y = 0; y < SCALE; y += 1) {
        for (let x = 0; x < SCALE; x += 1) {
          const px = (column + QUIET) * SCALE + x;
          const py = (row + QUIET) * SCALE + y;
          const index = (py * size + px) * 4;
          rgba[index] = 11;
          rgba[index + 1] = 31;
          rgba[index + 2] = 23;
          rgba[index + 3] = 255;
        }
      }
    }
  }
  return { rgba, size, modules };
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
for (const text of samples) {
  const { rgba, size, modules } = rasterise(text);
  const decoded = jsQR(rgba, size, size);
  const value = decoded?.data ?? null;
  const ok = value === text;
  if (!ok) failures += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${modules}x${modules}  ${text.length} chars  ${text}`);
  if (!ok) console.log(`      decoded: ${value}`);
}

if (failures) {
  console.error(`verify-qr: ${failures} of ${samples.length} codes did not read back`);
  process.exit(1);
}
console.log(`verify-qr: all ${samples.length} codes decode back to exactly the link they encode`);
