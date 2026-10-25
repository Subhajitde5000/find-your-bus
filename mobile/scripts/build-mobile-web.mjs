#!/usr/bin/env node
/**
 * Builds the lightweight mobile web bundle for Android and iOS (`mobile/`).
 *
 * Unlike the full website build (`cd fontend && npm run build`), the mobile app
 * build sets `NEXT_PUBLIC_MOBILE_APP=1` so Next.js omits the website-only intro
 * hero ("More going. Less guessing." + HeroMap illustration), "Handy for passengers",
 * "A little heads-up", "Go on, Kolkata is waiting.", "Simple as 1, 2, 3", and the
 * bottom "Set on bus" promo banner. It also skips generating `sw.js`/`offline.html`
 * because Capacitor ships all files natively inside the Android APK and iOS app.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = resolve(__dirname, "..");
const FRONTEND_ROOT = resolve(MOBILE_ROOT, "..", "fontend");
const OUT_DIR = join(FRONTEND_ROOT, "out");

const npmCmd = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(npmCmd, ["next", "build"], {
  cwd: FRONTEND_ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_MOBILE_APP: "1",
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

// Native Android/iOS apps load assets directly from the app bundle and do not use a Service Worker.
for (const unused of ["sw.js", "offline.html"]) {
  const target = join(OUT_DIR, unused);
  if (existsSync(target)) {
    rmSync(target, { force: true });
  }
}

const indexHtmlPath = join(OUT_DIR, "index.html");
if (!existsSync(indexHtmlPath)) {
  console.error(`build-mobile-web: expected ${indexHtmlPath} to exist after build.`);
  process.exit(1);
}

const html = readFileSync(indexHtmlPath, "utf8");
const forbidden = [
  "More going.",
  "Less guessing.",
  "Handy for passengers",
  "A little heads-up",
  "A smoother way to get there",
];
for (const snippet of forbidden) {
  if (html.includes(snippet)) {
    console.error(`build-mobile-web: mobile index.html still contains website-only section "${snippet}"`);
    process.exit(1);
  }
}

if (!html.includes("viewport-fit=cover")) {
  console.error("build-mobile-web: mobile index.html is missing viewport-fit=cover for transparent system bars");
  process.exit(1);
}

console.log("build-mobile-web: built lightweight mobile bundle in ../fontend/out (Android & iOS ready).");
