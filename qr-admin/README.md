# QR sticker maker (private)

A local page that turns a route or a bus stop into a sticker. **It is not part of the
website**: nothing here is exported by `npm run build`, it has no address on the public
site, and it must never be deployed. Open `index.html` by double-clicking it.

```
qr-admin/
  index.html              the tool
  qr-admin.css            its styles, including the A4 print layout
  qr-admin.js             link building, QR drawing, the print sheet
  data/catalog.js         every route and stop, generated from the site's data
  scripts/build-catalog.mjs   regenerate data/catalog.js after a data update
  scripts/verify-qr.mjs   generate → rasterise → decode every sample link
  scripts/test-admin.mjs  drive the page in a DOM: theme, links, print sheet
  vendor/qrcode.js        qrcode-generator by Kazuhiko Arase (MIT)
```

## Using it

1. Set **the website address inside every sticker** once, at the top of the page, and
   press Save. It is remembered in the browser.
2. **On a bus**: search the route, check the preview, add it to the print sheet. One
   sticker per route, to be fixed inside every bus of that route.
   **At a bus stop**: search the stop and do the same.
3. Press **Print**. Stickers are laid out 2 × 4 on A4 at 90 × 60 mm; print at 100%, not
   “fit to page”. Sticker paper or plain paper and clear tape both work.
4. Scan one sticker with a real phone **before** printing a run. `node
   qr-admin/scripts/verify-qr.mjs` proves the codes decode, but it cannot prove the paper
   is readable in a dim bus.

The bus form also has an optional **bus registration** field. Leave it empty today: the
sticker names the route, and the app works out which bus from your location and the
timetable. Filling it in produces `/on-bus?route=1&bus=WB 04 A 1234`, which is what a
future per-bus sticker will use; a sticker with a registration lets the app name the
vehicle outright.

## Light and dark

The moon/sun button in the top right switches the tool between light and dark, and the
choice is remembered in the browser. With nothing chosen it follows the operating system,
and it keeps following it if the system switches at sunset.

**Printing is always light.** Whatever theme the screen is in, a sticker prints black on
white at the same size: paper is white, and a printer would flood a dark background.

## What the links are

| Sticker | Link | Opens |
|---|---|---|
| On a bus | `<origin>/on-bus?route=1` | the bus screen: your position on the route, the bus you are most likely in, and your destination countdown |
| One bus (later) | `<origin>/on-bus?route=1&bus=WB 04 A 1234` | the same, with the vehicle named |
| At a stop | `<origin>/stop?stop=Esplanade` | the stop's next buses and the whole day |

Both are ordinary `https` links. On a phone with the app, Android App Links / iOS
Universal Links open them in the app; without the app they open the website. The same
links can also be opened by the phone's own camera app, which is why nothing here needs
a custom scheme.

The address is permanent once a sticker is on a bus. To change it, use
`node scripts/set_qr_domain.mjs https://your-domain` from the repository root — it
rewrites this tool's default, the app's constant and the native association files
together — then rebuild and redeploy.

## Before a print run

- **Scan on two phones**: one with the app installed (it should open the app) and one
  without (it should open the website). If the first opens the browser, the App Link has
  not verified yet: check `/.well-known/assetlinks.json` is live and its SHA-256 matches
  the signing certificate, and that `apple-app-site-association` carries the Apple Team
  ID.
- **Check the code size.** Long operator route numbers make a denser code; the tool
  shows the module count and millimetres per module for the 40 mm printed square. Below
  about 0.35 mm per module, print larger than 40 mm.
- **Print one, stick it, walk away, scan it.** A sticker at arm's length in daylight is
  not the same as one behind a driver's seat in the evening.
- **Where to stick them.** On a bus: inside, near the door and behind the driver where a
  standing passenger can reach it, never on a window or a safety notice. At a stop: on
  the shelter post at about 1.5 m, out of the sun.

## Checking the tool

```bash
node qr-admin/scripts/test-admin.mjs   # theme toggle, origin checks, links, print sheet
```

It loads `index.html` into jsdom (from `fontend/node_modules`, so run `cd fontend && npm
install` once) and drives the page the way a person would. It also proves the light/dark
toggle stores its choice, that an `http://` origin is refused, and that a malformed bus
plate never reaches a printed link.

## Regenerating the catalogue

After the site's data changes:

```bash
node qr-admin/scripts/build-catalog.mjs     # rewrite data/catalog.js
node qr-admin/scripts/verify-qr.mjs         # prove the codes still decode
```

`data/catalog.js` is committed on purpose: the tool must work by double-clicking the HTML
file, and browsers block `fetch()` on `file://` URLs. A plain `<script>` is not blocked.
