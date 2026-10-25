# QR sticker studio (`qr-admin/`)

A private page that builds the links and draws the QR codes for the two stickers:

| Sticker | Printed for | Opens |
|---|---|---|
| **On bus** | one per bus route, inside the bus | `/qr/bus?r=<route>` — finds your stop from the phone's position and works out which bus you are on |
| **At bus stop** | one per stop, on the shelter | `/qr/stop?s=<stop>` — today's buses from that stop, next two hours first, whole day a tap away |

**This folder is not part of the website build.** Nothing in `fontend/` imports it and
`npm run build` never copies it into `out/`. Keep it that way: open it from your own
computer, or host it behind a password you control. Never put it in the public web root,
never link to it from the site, and do not commit it to a public deployment.

---

## Open it

It is a plain static page with no build step and no dependencies to install:

```bash
# simplest: double-click qr-admin/index.html in your file manager
# or serve it locally (needed if your browser blocks local script files):
cd qr-admin && python3 -m http.server 8080
# then open http://localhost:8080
```

It works offline. The route and stop lists come from `data/routes.js` and
`data/stops.js`, generated from the same bundle the site ships:

```bash
cd fontend && npm run qr-data      # = node scripts/export-qr-admin-data.mjs
```

Re-run that after rebuilding the timetable data (`scripts/build_static_data.py`). If the
files are missing, the page offers a file picker: load
`fontend/src/data/kolkata-bus-data.json` instead and it builds the same lists in memory.

## Set the site address first

The first field is the domain the stickers point at, for example `https://cholo.in`.
It must be:

- **https** — App Links and Universal Links do not work over plain http;
- the **site root**, with no path after the domain;
- the **same domain** that holds `/.well-known/assetlinks.json` and
  `/.well-known/apple-app-site-association`.

It is remembered in that browser only. A sticker printed with the wrong domain is a
sticker that opens nothing, so check the preview link before printing a batch.

## Printing a batch

1. Pick a route (or a stop), check the sticker preview, **Add to print sheet**.
2. Repeat. The sheet is kept in this browser between visits; **Clear sheet** empties it.
3. **Print / save as PDF** prints only the stickers, three to a row on A4.

Practical notes, because these are going on real buses:

- **Size**: the bus sticker's link is about 40 characters, which is a 29×29 module code.
  Print the QR at **least 30 mm square**; 40–45 mm is comfortable from a seat. Stop links
  can be longer (long stop names are 45×45 modules or more) — keep those at **45–50 mm**.
- **Error correction**: `M` is the default and gives the smallest code. Use `Q` on buses
  where the sticker will be touched, rained on or cleaned over.
- **Contrast**: dark code on white, nothing printed behind it, and leave the quiet zone
  (the white margin) empty — the generator already includes it.
- **Where**: on the bus, high on the panel behind the driver or beside the door, where a
  standing passenger can reach it with a phone. At a stop, at eye level on the shelter,
  out of direct afternoon sun.
- **Test before you stick**: scan the printed sheet with a phone that does not have the
  app (should open the website) and one that does (should open the app).
- **Laminate or use a vinyl sticker.** Paper on a bus lasts about a week.

## Links the generator writes

```
https://<domain>/qr/bus?r=230                          route sticker, either direction
https://<domain>/qr/bus?r=230&d=r                      return direction only
https://<domain>/qr/bus?r=230&bus=WB%2012%20AB%203456   future per-bus sticker
https://<domain>/qr/bus?r=230&from=Exide&to=Garia       with stops pre-filled
https://<domain>/qr/stop?s=Esplanade                    stop sticker
```

The same format is implemented in [`../fontend/src/lib/qr.ts`](../fontend/src/lib/qr.ts),
and every sticker prints a short code under the QR (`BUS 230`, `STOP Esplanade`) for the
person whose camera will not focus.

Jumping straight to a screen while testing, without printing anything:

```
http://localhost:3000/qr/bus?r=230&from=Exide
http://localhost:3000/qr/stop?s=Esplanade
```

## Making the QR open the app

The links are ordinary `https` links. Whether they open the app is decided by the phone,
using files published on that domain:

```bash
cd fontend
APP_LINK_HOST=cholo.in \
ANDROID_SHA256_FINGERPRINTS="AA:BB:…:FF,11:22:…:00" \
ANDROID_PACKAGE_NAME=in.cholo.kolkatabus \
IOS_TEAM_ID=ABCDE12345 \
IOS_BUNDLE_ID=in.cholo.kolkatabus \
npm run build
```

- Android fingerprints come from the signing key
  (`keytool -list -v -keystore <keystore> -alias <alias>`). For a Play Store release use
  the SHA-256 shown in **Play Console → App integrity**, because Play re-signs the app.
- The Android manifest reads the host from `mobile/android/gradle.properties`
  (`appLinkHost=`), so set the same domain there and rebuild the APK/AAB.
- On iOS see `mobile/ios/App/App/App.entitlements.example` and `mobile/APP.md`.
- Without those files the stickers still work: the same link opens the website instead of
  the app, which is the fallback the feature is designed around.

## What it does not do

- It does not publish anything, call any API, or store anything except the host and the
  print sheet in `localStorage`.
- It cannot know whether a sticker is physically on the right bus. Print one per route,
  and put it on a bus **of that route**.
- It does not generate a "bus registration" identity for you: the optional registration
  field only prints the number into the link, which the screen displays. Live vehicle
  identity would need a fleet feed that this project does not have.
