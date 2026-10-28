# find-your-bus

**Pathsathi** (পথসাথী) — the name the website and apps ship under. Every user-facing
string, the icon, the manifest, the Android/iOS app id and the marketing kit use it.

Kolkata bus timetable guide: a **static Next.js site** plus a **FastAPI + PostgreSQL backend** that
is kept for the database side of the project.

```
backend/   FastAPI + PostgreSQL. Loads an Excel directory into Postgres, serves a JSON API.
fontend/   Next.js site. Ships as static files and makes no API calls.
data/      Source workbooks, the sample routes, the route extension, and the data audits.
scripts/   build_static_data.py — the workbooks -> bundled JSON exporter.
           geocode_stops.py    — stop coordinates for the offline ride screen.
           build_route_geometry.py — road shapes for the ride map, from OpenStreetMap.
           set_qr_domain.mjs   — put the permanent address into the QR stickers.
qr-admin/  The private QR sticker maker. Not part of the site; never deployed.
```

The website does not call the backend. All timetable data is generated once into
`fontend/src/data/kolkata-bus-data.json`, bundled at build time, and read in the browser.

## The offline ride screen ("Set on bus")

Open any bus from the timetable, or any route in the route explorer, and tap **Set on
bus**. It opens `/ride`, a full-page screen that follows you along the route **with no
network at all**:

- **Are you on the bus?** Your GPS position is matched against the route's corridor. On
  it, and the screen measures from where you are. Off it for more than 20 seconds and it
  says **"You are not seated in this bus"**, with the nearest stop and its distance,
  rather than showing times for a bus you are not on.
- **How far is the next stop?** Distance along the roads the route runs on, from a window
  of recent fixes smoothed along the corridor itself rather than on the map, so a bend
  cannot drag the marker off the line.
- **How long to every stop still ahead?** On a route with a published timetable, the
  published passage times. On a route without one, the corridor distance at that route's
  own measured speed — always labelled *estimate from distance*. A stop with neither a
  time nor a position gets a dash, never a guess.
- **Where are you on the route?** The route drawn as a map: **the roads the bus actually
  drives**, routed once offline over OpenStreetMap, simplified and bundled as a short
  line — no tiles, no API key, no download at the roadside. It is still not a *street*
  map: there are no other streets, buildings or landmarks. But the road you are on is the
  road in the drawing, and both the marker and every distance are measured along it.
  North arrow, scale bar, and your bus marked on the line. Stops the data cannot place
  are left off the map, and the caption says how many and why.
  The map zooms and pans: **+ / −**, pinch, drag, or Ctrl/Cmd + wheel. **Show the whole route**
  fits it back, and **Follow my bus** keeps the map centred on you. Stop names appear as you
  zoom in, placed so none overlap. The maths is in `fontend/src/lib/mapView.ts`.

It works offline because it has to be able to: a bus is exactly where you are least
likely to have a signal. The route, the stop coordinates and the timetable are all in the
bundle; the only live input is the phone's own GPS, read by the browser.

**This is not live tracking.** Nothing follows the bus. The only moving thing the site
knows about is the passenger's own phone.

## QR codes on buses and at bus stops

Two kinds of sticker, both plain `https` links, both working with no install and with no
signal once the page is on the phone.

| Sticker | Link | Opens |
|---|---|---|
| **On a bus** — one per route, inside every bus of that route | `/on-bus?route=1` (optionally `&bus=WB 04 A 1234`) | `/on-bus` |
| **At a bus stop** — one per stop | `/stop?stop=Esplanade` | `/stop` |

The links are ordinary web addresses on purpose: on a phone with the app installed,
**Android App Links** and **iOS Universal Links** open the sticker in the app; without the
app the same link opens the website. The phone's own camera app works too, and a printed
link never expires.

### On a bus (`/on-bus`)

The sticker can only say which *route* it is, because one sticker is stuck inside every
bus of that route. The screen works out the rest the way a passenger would:

1. the phone's GPS matches the position against the route's corridor, in both directions
   (`matchRide` in `fontend/src/lib/ride.ts`, the same engine as `/ride`);
2. the route's published runs say when each scheduled bus is at that point, interpolated
   by distance between the two printed stops around it (`fontend/src/lib/onBus.ts`);
3. the run nearest the clock is the bus the passenger is most likely in — and the card
   says how near, in minutes, so a bus 20 minutes late is shown as exactly that.

Then it asks, once, **where the passenger is getting off** (optional). With a destination
it counts down the journey: minutes, distance, the next stop, the arrival time, and a
"get ready / your stop is next / you have arrived" alert with a buzz. Choosing "skip"
follows the bus to its terminus, like the plain ride screen.

Everything has a way forward without GPS, because a bus is where GPS is worst: "No signal?
Choose your stop instead" identifies the bus from the stop the passenger has just left,
and the route's own stop list is on screen before any permission is granted. Blocked
location, no camera, an unlisted route, a route whose stops are not mapped: each has its
own plain sentence and a next step, never a dead screen.

Bus registration numbers are **not printed yet**. The link format already carries one
(`&bus=`), the scanner keeps it, and the screen shows it as a certain identification when
present — so a later per-bus sticker needs no change to any printed address.

### At a bus stop (`/stop`)

The next buses from now, with a wait, and behind one tap **the whole day** grouped by
hour (Esplanade has 261 routes and some 9,800 printed passes, so hours open one at a
time and each shows 40 rows at first). A filter narrows by route or destination. Every
row leads to the ride screen for that bus. Times are the operator's published passage
times at that stop; the page says once, plainly, that they are not live positions.

One static document serves all 2,194 stops, so a QR address never depends on a per-stop
page existing, and the service worker caches one page for every stop in the city.

### Scanning, in the browser and in the app (`/scan`)

- **In the app:** the native ML Kit scanner (`@capacitor-mlkit/barcode-scanning`), with the
  barcode model pre-downloaded (`com.google.mlkit.vision.DEPENDENCIES=barcode`) so a scan
  works offline. If the module is missing (old build, no Play services) the app falls back
  to the camera decoder, so the button always does something.
- **In the browser:** `getUserMedia` plus the built-in `BarcodeDetector` where it exists,
  and the bundled **jsQR** decoder everywhere else (iOS Safari has no `BarcodeDetector`).
  jsQR is loaded on demand, only on this screen.
- **Also:** paste a link by hand, or use the phone's camera app. A QR from any other
  website is refused and shown, never followed (`parseQrValue` in
  `fontend/src/lib/qrLinks.ts`).

There is a scan button in the site header, in the sidebar, in the app's home-screen
shortcuts, and on both QR screens.

### How the three screens are laid out

All three pages are answer-first: the thing the passenger scanned for is at the top, and
every button below it is a way forward. Nothing important is behind a fold they have to
find, and nothing repeats.

- **`/on-bus`** — a route header that fits on one card (number, termini, operator, and the
  Kolkata clock in its footer strip), then the status card, then the answer. The
  identification card leads with a sentence ("You are on route 1" / "No bus matches this
  time closely") and a confidence badge; the run that produced it is a small caption
  underneath, with the evidence (printed time, clock, source) in one tinted strip. The
  destination question comes after that, then the journey: minutes, distance and stop up
  front, with the map, the progress bar and the stop list divided inside the same card
  instead of stacking as three more boxes. "No signal? Choose your stop instead" is the
  one fallback, and the route's own timetable folds away until asked for. A footer with
  two buttons (scan again, buses at your stop) and the direction correction closes the
  screen. Below 760 px the status card stacks and its buttons go full width; the map and
  stop list stay inside the journey card, so the page has one rhythm rather than six.
- **`/stop`** — the stop card carries the name, how many buses call here, and a footer strip
  with the one caveat ("published times, not live positions") plus the current minute.
  Under it a sticky toolbar: **Next** / **Whole day** and the filter, with the wait for the
  next bus on the tab. Each bus is one row — a fixed time column, route and destination,
  operator under it, and the wait as a badge on the right, with the row itself leading to
  the ride screen. **Whole day** opens as hours, the current hour first and highlighted.
- **`/scan`** — a wide, dark camera stage with a corner frame and a sweeping line, one
  primary button, and "find a stop without scanning" as a quiet link under it. Messages are
  inline cards, not alerts: permission denied, no camera, unreadable code, and a *foreign*
  code (shown and refused, never followed). Pasting a link, and the two sentences that say
  what each sticker does, sit below in a single card each.

The three screens share one CSS block in `globals.css` (`.qr-*`, `.ob-*`, `.stop-*`,
`.scan-*`) written against the site's theme variables, so light and dark are the same
layout. The camera stage stays dark in both themes, because a bright screen ruins a scan.

### The private sticker maker

`qr-admin/` is a **separate folder, not a route on the website**: no page under
`fontend/src/app`, nothing in `fontend/out`, nothing to find on the public server. Open
`qr-admin/index.html` directly. It searches the site's own route and stop lists, builds the
link, draws the QR, downloads PNG/SVG, and lays the stickers out on A4 for printing.

Every code carries the **Pathsathi logo** in the middle — the website's own bus mark, on a
white plate — with the code raised to error correction level H so the mark can cover part
of the pattern and still read. The sticker's **size is a choice**: four presets (Small
70 × 45 mm up to Wide 190 × 55 mm) or a hand-typed width, height, code size and gap, with
the sheet reporting how many fit on a page and the millimetres per printed module, warning
when a code is too dense to rely on. The sheet is drawn at paper size and broken into real
A4 pages, so the preview is the print. It has its own light/dark switch in the top right
(remembered per browser, following the system until you choose); printing is always black
on white, in either theme. See [`qr-admin/README.md`](qr-admin/README.md).

It carries every route and stop in `qr-admin/data/catalog.js`, generated from
`fontend/src/data/kolkata-bus-data.json` by `node qr-admin/scripts/build-catalog.mjs`.
`node qr-admin/scripts/verify-qr.mjs` generates a code **with and without the logo**,
rasterises it at the printed sizes and decodes it with the same jsQR the scanner uses, so
the encoder is proven, not assumed. `node qr-admin/scripts/test-admin.mjs` drives the page
itself in jsdom: the light/dark switch and what it remembers, the origin rules, the link
that lands in a QR, the logo toggle, the sticker sizes and their page counts.

### Setting the permanent address

The address is the one part of a sticker that can never change, so it lives in one place:

```bash
node scripts/set_qr_domain.mjs https://your-domain --sha256 "AA:BB:…" --team-id ABCDE12345
node scripts/set_qr_domain.mjs --help      # prints the usage
cd mobile && npm run sync                  # copy the site and the native config
```

It rewrites `SITE_ORIGIN` in `fontend/src/lib/qrLinks.ts`, the host in the Android
manifest, the associated domains in the iOS entitlements, and the sticker maker's default.

For the link to open in the app, the two association files must also be live on that
domain, filled in with the account values that only the developer accounts know:

| File | What it needs |
|---|---|
| `fontend/public/.well-known/assetlinks.json` | the app's signing-certificate SHA-256 (Play Console → App integrity, or `keytool -list -v`) |
| `fontend/public/.well-known/apple-app-site-association` | the Apple Team ID in `TEAMID.in.pathsathi.kolkatabus` |

Both are served at the domain root by the static export (they are copied from
`fontend/public/`). They must come back as `200`, as `application/json`, with **no
redirect** — Apple and Google both refuse a redirect here, which is the usual reason a
correct-looking sticker still opens in the browser. Until they are filled in and verified, an Android browser shows a
dismissible "Open in app" hint on the QR screens instead, using an `intent://` link.

### What the stickers cannot do

- **They are not live tracking.** No bus reports its position. The on-bus screen compares
  the passenger's own GPS with the timetable, and says when no bus matches the clock.
- **One sticker per route, not per vehicle**, in this version. The route and the time
  identify the bus; the registration field exists in the link for later.
- **A sticker is only as good as its placement.** Fix it inside the bus where a standing
  passenger can reach it, and at the stop on the shelter at about 1.5 m — not on glass, not
  in the sun. Print at 100%, and scan a sample with two phones (one with the app, one
  without) before a print run.

### Installable (PWA)

`npm run build` writes a web app manifest and a service worker that precaches the whole
app shell — about 2.8 MB, of which the road shapes are roughly 72 KB compressed. After
the first visit the site loads and runs with no signal, and can be installed to a home
screen on Android and iOS.

Stop coordinates come from openly published open datasets and are checked against the
route chains; see [`data/STOP_COORDINATE_AUDIT.md`](data/STOP_COORDINATE_AUDIT.md).

## Frontend (static site)

```bash
cd fontend
npm install
npm run dev        # http://localhost:3000
npm run build      # static export -> fontend/out, then writes out/sw.js
npm run lint
npm run typecheck
npm test             # journey search, ride engine, QR links/stops/identification, render and page tests
```

`npm run build` writes plain HTML/CSS/JS to `fontend/out`, which can be served by any static host
(nginx, S3 + CloudFront, Netlify, GitHub Pages, Vercel static output). There is no server, no
serverless function and no runtime data fetching.

After the export, `scripts/build_sw.mjs` walks `out/` and writes `out/sw.js` with a
precache list hashed from the file contents, so a new build always replaces the old cache
and an unchanged one never invalidates it. The service worker is registered in production
only — in development it would serve stale code.

Icons in `fontend/public/icons/` are drawn by `fontend/scripts/make_icons.py` from the
brand colours, so they can be regenerated instead of being edited by hand.

### Offline requires https (or localhost)

`navigator.geolocation` and service workers both need a secure context. Serve `out/` over
https, or test on `http://localhost`. A plain-http LAN address will work for the
timetable but not for the ride screen.

### Testing the ride screen without a bus

`/ride` accepts a route as a query string, so you can open it directly:

```
/ride?route=1&dir=outbound                     # route number, direction
/ride?route=230&dir=return&from=Esplanade&to=Alipore%20Zoo
/ride?route=1&dir=outbound&run=RUN-1-OUT-01    # a specific published run
```

### Testing a QR screen without a sticker

Every sticker is just a link, so the screens can be opened directly:

```
/on-bus?route=1                        # the bus screen for route 1
/on-bus?route=230&bus=WB%2004%20A%201234
/stop?stop=Garia                       # next buses and the whole day at a stop
/stop?stop=Howrah%20Stn                # aliases resolve to the directory name
/scan                                  # the scanner (needs a camera, or paste a link)
```

`/on-bus` needs a GPS fix to identify the bus, or a stop picked from "No signal? Choose
your stop instead"; a desktop browser with location services gives it one.

To try it without moving, open the page on a laptop and use your browser's location
override (Chrome DevTools → Sensors → Location) to place yourself on a stop's
coordinates — `data/stop_coordinates_review.csv` has all of them.

`npm test` also covers the ride engine directly: synthetic routes for the exact
matching cases, the real dataset for the invariants, and a simulated ride that walks a
real route's corridor with realistic GPS noise and asserts the passenger is never
wrongly told they are not on the bus.

### Regenerating the data file

The JSON is generated from the **v2** workbooks by a standalone script (no database, no backend):

```bash
python -m venv .venv
.venv/bin/pip install openpyxl pillow
.venv/bin/python scripts/build_static_data.py
```

That reads:

1. `data/Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx`
2. `data/Kolkata_Bus_Stands_v2.xlsx`
3. `data/timetable_preview_routes.json`
4. `data/Kolkata_Bus_Routes_Extension-v3.xlsx` (the routes missing from v2; pass
   `--no-extension` to build from the v2 workbook alone)
5. `data/stop_coordinates.json` (the reviewed stop coordinates; pass `--no-coordinates`
   to build without them)

and writes `fontend/src/data/kolkata-bus-data.json`. Re-run it whenever the workbooks change, then
rebuild the site.

Stop coordinates are a separate step, because they come from a different kind of source
and need reviewing:

```bash
.venv/bin/python scripts/geocode_stops.py            # -> data/stop_coordinates.json
.venv/bin/python scripts/build_static_data.py        # merges them into the site JSON
```

`geocode_stops.py` downloads two open datasets into `.cache/geocode/`, matches every stop
name, checks each match against the route chains, and writes both the table and
`data/stop_coordinates_review.csv` for you to check. See
[`data/STOP_COORDINATE_AUDIT.md`](data/STOP_COORDINATE_AUDIT.md) for what it found, what
it rejected and what is still missing. Add `--osm` to fill the gaps from OpenStreetMap;
that needs full internet access, which this repository's build environment does not have. The script prints the counts and refuses to write if the workbook is internally
inconsistent (return stops not the outbound stops reversed, a run with the wrong number of times,
duplicate route numbers or run codes).

The map's road shapes are a separate, one-off step, committed with the site so the
browser never contacts a routing service:

```bash
.venv/bin/pip install pyshp                 # the only dependency
.venv/bin/python scripts/build_route_geometry.py
```

It downloads one 30 MB archive of OpenStreetMap road lines (pinned by commit and checked
by SHA-256), exports them through HOT's raw-data-api, snaps every located stop of every
timed route to the nearest road, routes each leg with A* over that graph, simplifies the
result to 5 m and refuses any leg that detours more than six times its straight-line
distance. It writes `fontend/src/data/route-geometry.json`: about 270 KB for 512 of the
552 directed legs of the 84 timed routes (72 KB gzipped). The rest are drawn as straight
lines and the map caption says how many. A stop more than 130 m from any road is left
unplaced rather than given an invented road. A warm run takes about a minute; the cached
download lives in `.cache/`, which is git-ignored.

The road data is © OpenStreetMap contributors, available under the
[Open Database Licence](https://opendatacommons.org/licenses/odbl/1-0/). That attribution
is shown on the map and in the ride screen's notes.

To rebuild the route extension itself (it downloads the two public datasets into `.cache/`,
which is git-ignored):

```bash
.venv/bin/python scripts/import_external_routes.py     # staging -> data/external-routes.json
.venv/bin/python scripts/build_extension_workbook.py   # -> data/Kolkata_Bus_Routes_Extension-v3.xlsx
.venv/bin/python scripts/build_static_data.py          # both workbooks -> site JSON
```

The old `backend/app/static_export.py` still reads the old
`Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx`; it is **not** used to build the site
and is kept only for the backend history.

### What is in the data file

| Key | Contents |
|---|---|
| `stands` | 193 depots, terminals and route stands from `Kolkata_Bus_Stands_v2.xlsx` |
| `stops` | 2,194 unique stop names, each optionally linked to a stand, and 1,209 of them with a reviewed `lat`/`lng` and `coordConfidence` |
| `buses` | 343 vehicle registration numbers |
| `routes` | 650 routes: 75 from the v2 directory, 8 sample routes, 566 catalogue routes with no timetable, 1 externally timed long-distance service |
| `runs` | 1,058 directional runs, each with one time per stop |
| `meta` | counts, and a `dedupe` record of everything that was merged or skipped |

De-duplication rules applied by the script (all recorded under `meta.dedupe`):

- **Routes** are unique by number. When v2 publishes the same number as a sample route, the
  directory entry wins. 12 of the 20 preview routes are therefore skipped (`S5`, `AC5`, `AC6`,
  `5`, `S12`, `AC12`, `S24`, `AC9`, `AC4`, `S21`, `S4`, `AC1`); the other 8 are kept. v2 owns
  route `5`, so the old sample `5` is replaced by v2's real route `5`; v2 has no `S14`, so sample
  `S14` is retained. The number of sample routes is still 8.
- **Stops** are unique by name. Only eleven certain spelling groups are merged (for example
  `Howrah Stn`/`Howrah Station` → `Howrah Railway Station`, `Sealdah Stn` → `Sealdah`,
  `BBD Bag` → `B.B.D. Bagh`, `Ultadanga / HUDCO` → `Ultadanga`). Everything else keeps the name
  the v2 timetable prints. No stop is added from a sheet's prose "distance alignment" sentence;
  46 of the 75 sheets differ from it, and those stops have no published time.
- **Buses** are unique by normalised registration (`WB 05 6214` == `WB056214`).
- **Runs** are unique by run code and stored per direction. Outbound and return rows are not paired
  into a synthetic round trip; the workbook publishes no such pairing.

### Kinds of departure

- **Scheduled** — a published run from the v2 directory. The workbook gives a passage time at every
  stop column, so a journey between any two stops uses the times printed for that run and that
  direction. Nothing is interpolated and no `~` is shown.
- **Sample** — a route from the preview list using its first/last/every frequency. It is always
  labelled `Sample`. The return is modelled as the same sample bus coming back after its outbound
  travel time plus the sample turnaround, so it cannot copy the outbound times.
- **No timetable** — a catalogue route (566 of them) is listed as "connects your stops, no
  timetable yet" with no times at all. Kolkata city buses run to frequency, so this is the honest
  state, not a gap to fill with estimates.
- **External timed** — one long-distance service (`RADHARANI`, Amlasuli → Karunamoyee) whose
  operator publishes a time at every stop. Its passage times are copied from that timetable.

A journey and its reverse use the times of the direction the bus actually travels, so they never
show the same list. `npm test` checks this for every route and every pair of its stops, including
the sample routes.

### Why the v2 directory has 75 routes

Kolkata city and suburban buses mostly **run to frequency** — no operator or government body
publishes a fixed departure timetable for them, and there is no open GTFS feed. The old 460-route
directory listed many routes with no runs at all and only terminal times for the 87 that did have
runs. The v2 workbook is a smaller, complete directory: 75 routes, each with a published passage
time at every stop it lists.

The site then adds the missing route numbers from the WBTC city route list and Bus-O-Pedia:
566 routes with their real termini and full stop chains, and **no times**, because none is
published. They appear as "connects your stops, no timetable yet". The extension workbook and its
rules are documented in [`data/ROUTE_EXPANSION_AUDIT.md`](data/ROUTE_EXPANSION_AUDIT.md).

`data/TIMETABLE_SOURCE_AUDIT.md` records the sources checked before reaching that conclusion: the
official WBTC route list (routes and stoppages, no times), the BusJatri open dataset (4,728
services; 317 rows match this project's routes and **none** of them carries a time), and the sites
that do display a city timetable — one of which states outright that its times are "estimated,
assumed per stop". Nothing from them was added. Where a time cannot be sourced, the field stays
blank.

Nothing in the site is live tracking, except that the ride screen knows where *you* are,
from your own phone's GPS, and tells you whether that is on the route you opened.

## Backend

See [`backend/README.md`](backend/README.md). It still loads the old directory into Postgres and is
unrelated to the static site.

```bash
cd backend
python manage.py init-db
python manage.py import-data            # Excel -> PostgreSQL
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Data notes

Times come straight from the v2 spreadsheets and are not checked against official schedules. The
workbooks are the source; the JSON is derived. No cell in either workbook was edited by the v2
migration. Sample routes carry illustrative frequencies.

The measured differences between the old directory and v2, the decision to use v2, and the
consequences (C11 is Howrah–Tollygunge in v2; the 397 old-only routes are no longer listed; v2 has
no Salt Lake Sector V timetable column) are recorded in
[`data/DATA_SOURCE_CONFLICT.md`](data/DATA_SOURCE_CONFLICT.md).

See [`data/DIRECTION_BUG_AUDIT.md`](data/DIRECTION_BUG_AUDIT.md) for the direction-bug measurement,
the v2 migration checks and the remaining risks, and
[`data/ROUTE_EXPANSION_AUDIT.md`](data/ROUTE_EXPANSION_AUDIT.md) for the 566 added catalogue routes,
the de-duplication rules and the sources checked for city timetables.

## Stop map, alerts and landmarks

- **/map** — every stop with a published position on one offline map. Search a stop, tap a stop to see which buses call there (and draw a bus's route), "Nearest stop to me" (reads the GPS once, no tracking), day / night / automatic map style, and switches for roads and landmarks. The same tools (stop tap, stop search, nearest stop of the route, landmarks, night style) are on the ride screen's route map.
- **Ride alerts** — on the ride screen: "Get ready: 2 stops left", "Your stop is next", "You are at …", "You have passed …", and a wrong-direction warning that offers to switch direction. A short vibration is used where the browser allows it (not iPhone Safari). Logic and its rules: `fontend/src/lib/alerts.ts`.
- **Road paths for every route** — `python scripts/build_route_geometry.py --all-routes` routes every route with located stops (about 5,000 legs) instead of only the timetabled ones. Run it on a computer with internet; it rewrites `fontend/src/data/route-geometry.json`.
- **Landmarks** — the map's optional layer: the Hooghly and the other rivers, the canals, the named lakes and ponds (filled outlines), station buildings, plus named stations, hospitals, colleges, places of worship and bridges. Each feature records its `source`, and nothing is added by hand:
  - `python scripts/build_landmarks.py --from-stops` (offline) marks stops whose names say what they are at the stop's own published position.
  - `--geojson rivers.geojson --geojson canals.geojson --geojson water-bodies.geojson` (offline once downloaded) adds OpenStreetMap water: 46 river stretches (the Hooghly, Adi Ganga, Saraswati), 15 canal stretches (Circular, Bagjola, Beliaghata, Krishnapur) and 101 named lakes and tanks, clipped to the map window and simplified so the layer costs ~170 KB. Rivers and canals are named at every zoom; a lake is named once it is worth naming, and the smaller tanks are named when the reader zooms in.
  - `--hot-export <dir>` (offline once unpacked) adds named stations and the real footprints of 28 station buildings from the Humanitarian OpenStreetMap Team's raw-data-api export.
  - `--overpass` (needs internet) is the one-shot alternative that asks OpenStreetMap directly. 
