#!/usr/bin/env node
/**
 * Set the one permanent piece of a QR sticker: the web address inside it.
 *
 * A printed sticker can never be recalled, so the address in this project lives in one
 * constant and is copied into the few files that cannot read it:
 *
 *   fontend/src/lib/qrLinks.ts                     SITE_ORIGIN (every link the app makes)
 *   mobile/android/.../AndroidManifest.xml         android:host (Android App Links)
 *   mobile/ios/App/App/App.entitlements            applinks: (iOS Universal Links)
 *   qr-admin/qr-admin.js                           DEFAULT_ORIGIN (the sticker maker)
 *
 * Usage:
 *
 *   node scripts/set_qr_domain.mjs https://cholo.in
 *   node scripts/set_qr_domain.mjs https://cholo.in --sha256 "AA:BB:...:FF" --team-id ABCDE12345
 *
 * `--sha256` and `--team-id` fill in the two values only the developer accounts know:
 * the Android signing certificate's SHA-256 fingerprint (Play Console → App integrity,
 * or `keytool -list -v -keystore ...`) and the Apple Team ID. Without them the
 * association files keep their REPLACE_WITH_… / TEAMID placeholders, and phones will
 * open the sticker in the browser instead of the app until they are filled in.
 *
 * Run it once, before printing anything, then:
 *
 *   cd mobile && npm run sync        # copy the new site and the new native config
 *
 * No dependencies: Node's standard library only.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LINKS = join(ROOT, "fontend/src/lib/qrLinks.ts");
const MANIFEST = join(ROOT, "mobile/android/app/src/main/AndroidManifest.xml");
const ENTITLEMENTS = join(ROOT, "mobile/ios/App/App/App.entitlements");
const ASSETLINKS = join(ROOT, "fontend/public/.well-known/assetlinks.json");
const AASA = join(ROOT, "fontend/public/.well-known/apple-app-site-association");
const ADMIN = join(ROOT, "qr-admin/qr-admin.js");

function fail(message) {
  console.error(`set_qr_domain: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { origin: null, sha256: null, teamId: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--sha256") args.sha256 = argv[++index] ?? null;
    else if (value === "--team-id") args.teamId = argv[++index] ?? null;
    else if (value.startsWith("--")) fail(`unknown option ${value}`);
    else if (!args.origin) args.origin = value;
    else fail(`unexpected argument ${value}`);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.origin) {
  console.error("Usage: node scripts/set_qr_domain.mjs https://your-domain [--sha256 AB:CD:…] [--team-id ABCDE12345]");
  process.exit(1);
}

let next;
try {
  next = new URL(args.origin.trim());
} catch {
  fail(`"${args.origin}" is not a URL. Use the whole address, e.g. https://cholo.in`);
}
if (next.protocol !== "https:") fail("use https: a QR sticker must open a secure page (the camera and the timetable both need it)");
if (next.pathname !== "/" && next.pathname !== "") fail("give the site's root address, with no path after it");
if (next.search || next.hash) fail("give the site's root address, with no query or fragment");

const origin = `${next.protocol}//${next.host}`;
const host = next.host;
const wwwHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;

const currentSource = readFileSync(LINKS, "utf8");
const currentMatch = /export const SITE_ORIGIN = "([^"]+)"/.exec(currentSource);
if (!currentMatch) fail("could not find SITE_ORIGIN in fontend/src/lib/qrLinks.ts");
const current = currentMatch[1];
const currentHost = new URL(current).host;
if (current === origin && !args.sha256 && !args.teamId) {
  console.log(`set_qr_domain: ${origin} is already set; nothing to do.`);
  process.exit(0);
}

let changed = 0;
function replaceIn(file, edits) {
  if (!existsSync(file)) {
    console.warn(`set_qr_domain: skipped missing ${file}`);
    return;
  }
  const before = readFileSync(file, "utf8");
  let after = before;
  for (const [from, to] of edits) after = after.split(from).join(to);
  if (after !== before) {
    writeFileSync(file, after, "utf8");
    changed += 1;
    console.log(`  updated ${file.replace(`${ROOT}/`, "")}`);
  }
}

replaceIn(LINKS, [[`export const SITE_ORIGIN = "${current}"`, `export const SITE_ORIGIN = "${origin}"`]]);
replaceIn(MANIFEST, [[`android:host="${currentHost}"`, `android:host="${host}"`]]);
replaceIn(ENTITLEMENTS, [
  [`applinks:${currentHost}`, `applinks:${host}`],
  [`applinks:www.${currentHost.replace(/^www\./, "")}`, `applinks:${wwwHost}`],
]);
replaceIn(ADMIN, [[`const DEFAULT_ORIGIN = "${current}"`, `const DEFAULT_ORIGIN = "${origin}"`]]);

if (args.sha256) {
  const fingerprint = args.sha256.trim().toUpperCase();
  if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fingerprint)) {
    fail("the SHA-256 fingerprint must be 32 colon-separated byte pairs, e.g. 14:6D:E9:83:…");
  }
  replaceIn(ASSETLINKS, [
    [/"sha256_cert_fingerprints": \[[^\]]*\]/, `"sha256_cert_fingerprints": ["${fingerprint}"]`],
  ]);
}

if (args.teamId) {
  if (!/^[A-Z0-9]{10}$/.test(args.teamId)) fail("the Apple Team ID is ten capital letters and digits");
  replaceIn(AASA, [["TEAMID.in.cholo.kolkatabus", `${args.teamId}.in.cholo.kolkatabus`]]);
}

console.log(
  changed
    ? `set_qr_domain: stickers now point at ${origin}.\n` +
        "Next: cd mobile && npm run sync, rebuild the app, and deploy the site so /.well-known/ is live.\n" +
        "Anything already printed with the old address keeps working only if that address still serves this site."
    : `set_qr_domain: nothing needed changing for ${origin}.`,
);
