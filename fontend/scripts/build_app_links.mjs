#!/usr/bin/env node
/**
 * Writes the two files that make a scanned QR open the installed app:
 *
 *   out/.well-known/assetlinks.json               Android App Links
 *   out/.well-known/apple-app-site-association    iOS Universal Links
 *
 * Both must be served from the domain's root over https, with no redirect, which is why
 * they are written into the exported `out/` tree here rather than kept as static files in
 * `public/`: the values differ per deployment and a placeholder would quietly fail
 * verification.
 *
 * Set these before `npm run build`:
 *
 *   APP_LINK_HOST=cholo.example.com                  (bare host, no scheme or path)
 *   ANDROID_SHA256_FINGERPRINTS=AA:BB:...:FF,11:22:...  (comma separated; debug + release)
 *   ANDROID_PACKAGE_NAME=in.cholo.kolkatabus         (default)
 *   IOS_TEAM_ID=ABCDE12345
 *   IOS_BUNDLE_ID=in.cholo.kolkatabus                (default)
 *
 * With APP_LINK_HOST unset the build still succeeds and the files are not written: the QR
 * screens keep working on the website, and the app simply opens links in a browser.
 *
 * Get the Android fingerprints from the signing key:
 *   keytool -list -v -keystore <keystore> -alias <alias>
 * For a Play Store release, use the SHA-256 from Play Console > App integrity instead
 * (Play re-signs the app, so the upload key is not the one devices see).
 *
 * No dependencies: Node's standard library only.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(fileURLToPath(new URL("..", import.meta.url)), "out");
const WELL_KNOWN = join(OUT, ".well-known");

function cleanHost(value) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

const host = cleanHost(process.env.APP_LINK_HOST);
const androidPackage = (process.env.ANDROID_PACKAGE_NAME ?? "in.cholo.kolkatabus").trim();
const iosBundle = (process.env.IOS_BUNDLE_ID ?? "in.cholo.kolkatabus").trim();
const iosTeam = (process.env.IOS_TEAM_ID ?? "").trim();
const fingerprints = String(process.env.ANDROID_SHA256_FINGERPRINTS ?? "")
  .split(",")
  .map((value) => value.trim().toUpperCase())
  .filter(Boolean);

if (!host) {
  console.warn(
    "build_app_links: APP_LINK_HOST is not set, so no App Link / Universal Link files were written.\n" +
      "                 The QR pages still work on the website. Set APP_LINK_HOST and rebuild before\n" +
      "                 printing stickers if scanned codes should open the installed app directly.",
  );
  process.exit(0);
}

if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
  console.error(`build_app_links: APP_LINK_HOST "${host}" does not look like a bare host, e.g. cholo.example.com.`);
  process.exit(1);
}

mkdirSync(WELL_KNOWN, { recursive: true });
const written = [];

if (fingerprints.length) {
  for (const value of fingerprints) {
    if (!/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value)) {
      console.error(`build_app_links: "${value}" is not a SHA-256 fingerprint (32 colon-separated hex pairs).`);
      process.exit(1);
    }
  }
  const assetlinks = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: androidPackage,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
  writeFileSync(join(WELL_KNOWN, "assetlinks.json"), `${JSON.stringify(assetlinks, null, 2)}\n`);
  written.push("assetlinks.json");
} else {
  console.warn(
    "build_app_links: ANDROID_SHA256_FINGERPRINTS is not set, so Android App Links were skipped.\n" +
      "                 Scanned links will open in a browser on Android instead of the app.",
  );
}

if (iosTeam) {
  const association = {
    applinks: {
      details: [
        {
          appIDs: [`${iosTeam}.${iosBundle}`],
          components: [
            { "/": "/qr/*", comment: "On-bus and at-stop stickers" },
            { "/": "/scan", comment: "Scanner" },
            { "/": "/ride*", comment: "Set on bus / ride screen" },
          ],
        },
      ],
    },
  };
  writeFileSync(join(WELL_KNOWN, "apple-app-site-association"), `${JSON.stringify(association, null, 2)}\n`);
  written.push("apple-app-site-association");
} else {
  console.warn(
    "build_app_links: IOS_TEAM_ID is not set, so iOS Universal Links were skipped.\n" +
      "                 Scanned links will open in Safari on iOS instead of the app.",
  );
}

if (written.length) {
  console.log(`build_app_links: wrote ${written.join(" and ")} for ${host}.`);
} else {
  console.warn("build_app_links: nothing written — all fingerprints and team id were empty.");
}
