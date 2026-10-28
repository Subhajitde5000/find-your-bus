# QR sticker maker (private)

A local page that turns a route or a bus stop into a sticker. **It is not part of the
website**: nothing here is exported by `npm run build`, it has no address on the public
site, and it must never be deployed. Open `index.html` by double-clicking it.

```
qr-admin/
  index.html              the tool
  qr-admin.css            its styles, including the A4 print layout
  qr-admin.js             link building, QR drawing, the print sheet
  logo.js                 the Cholo mark as data, shared with verify-qr.mjs
  data/catalog.js         every route and stop, generated from the site's data
  scripts/build-catalog.mjs   regenerate data/catalog.js after a data update
  scripts/verify-qr.mjs   generate → rasterise → decode every sample link
  scripts/test-admin.mjs  drive the page in a DOM: theme, links, sizes, print sheet
  vendor/qrcode.js        qrcode-generator by Kazuhiko Arase (MIT)
```

## Using it

1. Set **the website address inside every sticker** once, at the top of the page, and
   press Save. It is remembered in the browser.
2. **On a bus**: search the route, check the preview, add it to the print sheet. One
   sticker per route, to be fixed inside every bus of that route.
   **At a bus stop**: search the stop and do the same.
3. Choose a **sticker size** (see below), then press **Print**. Print at 100%, not “fit to
   page”. Sticker paper or plain paper and clear tape both work.
4. Scan one sticker with a real phone **before** printing a run. `node
   qr-admin/scripts/verify-qr.mjs` proves the codes decode, but it cannot prove the paper
   is readable in a dim bus.

The bus form also has an optional **bus registration** field. Leave it empty today: the
sticker names the route, and the app works out which bus from your location and the
timetable. Filling it in produces `/on-bus?route=1&bus=WB 04 A 1234`, which is what a
future per-bus sticker will use; a sticker with a registration lets the app name the
vehicle outright.

## The logo inside the code

Every code carries the Cholo mark — the same bus-in-a-square as the website icon and the
app — drawn in the middle on a white plate. `logo.js` holds the geometry, so the page, the
PNG/SVG downloads and `verify-qr.mjs` all draw exactly the same thing.

A logo covers real modules, so two things pay for it:

- the code is generated at **error correction level H** (about 30% recoverable) instead of
  M, which makes it a little denser;
- the mark is kept small — a 20.5% square on a 27% white plate, about 4% of the code's
  area, well inside what level H can rebuild.

`node qr-admin/scripts/verify-qr.mjs` proves it rather than assuming it: it rasterises
eight real links **with the logo**, at 300 dpi at the printed sizes the tool offers, and
decodes each one with the same jsQR the website's scanner uses. Untick **Cholo logo in the
middle of every code** to print plain codes.

## Sticker size

The **Sticker size** row in the print sheet sets the physical sticker:

| Preset | Sticker | Code | Fits on A4 |
|---|---|---|---|
| Small | 70 × 45 mm | 30 mm | 10 |
| Standard | 90 × 60 mm | 40 mm | 8 |
| Large | 120 × 65 mm | 50 mm | 3 |
| Wide | 190 × 55 mm | 42 mm | 4 |

Width, height, code size and the gap between stickers can also be typed in, within what
makes sense on A4 (40–190 mm wide, 30–140 mm tall, 20–110 mm code, 0–15 mm gap). The code
is never allowed to outgrow its sticker, and an empty or impossible field keeps the last
good number.

The sheet is **drawn at paper size** — the page frame is A4 and every sticker is its real
width, at CSS's 96 dpi — so the preview on screen is the sheet that comes out of the
printer, and the page count in the heading is the number of sheets printed. Each page is a
real page break in print, so a sticker is never cut in half. On a window narrower than A4
the whole frame is zoomed down to fit (a phone shows about 0.4×); printing always resets it
to 1:1, so the paper is never scaled.

A sticker only has room for so many words. When the code leaves less than about 26 mm
beside it, the sentence about what scanning does is dropped; when it leaves less than
16 mm, the small "on bus · route sticker" eyebrow goes too, and the sticker is the bus, its
route and the link. The tool says when that has happened rather than printing an
overprinted scrap.

Next to the size row the tool reports **millimetres per printed module**. Below about
0.35 mm — a dense link on a small sticker, especially with the logo — it says the code is
too dense and asks for a bigger size or no logo, because a code that cannot be scanned is
worse than no sticker. The size is remembered in the browser.

## Light and dark

The moon/sun button in the top right switches the tool between light and dark, and the
choice is remembered in the browser. With nothing chosen it follows the operating system,
and it keeps following it if the system switches at sunset.

**Printing is always light.** Whatever theme the screen is in, a sticker prints black on
white at the same size: paper is white, and a printer would flood a dark background. The
logo keeps its own colours, because it sits on its own white plate.

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
  shows the module count and the millimetres per module at the size you chose. Below
  about 0.35 mm per module it warns: print larger, or turn the logo off.
- **Print one, stick it, walk away, scan it.** A sticker at arm's length in daylight is
  not the same as one behind a driver's seat in the evening.
- **Where to stick them.** On a bus: inside, near the door and behind the driver where a
  standing passenger can reach it, never on a window or a safety notice. At a stop: on
  the shelter post at about 1.5 m, out of the sun.

## Checking the tool

```bash
node qr-admin/scripts/test-admin.mjs   # theme, origin, links, logo, sizes, page count
```

It loads `index.html` into jsdom (from `fontend/node_modules`, so run `cd fontend && npm
install` once) and drives the page the way a person would. It also proves the light/dark
toggle stores its choice, that an `http://` origin is refused, that a malformed bus plate
never reaches a printed link, that the logo and the sticker size are remembered and
clamped, and that the sheet breaks into the number of A4 pages it claims.

## Regenerating the catalogue

After the site's data changes:

```bash
node qr-admin/scripts/build-catalog.mjs     # rewrite data/catalog.js
node qr-admin/scripts/verify-qr.mjs         # prove the codes still decode
```

`data/catalog.js` is committed on purpose: the tool must work by double-clicking the HTML
file, and browsers block `fetch()` on `file://` URLs. A plain `<script>` is not blocked.
