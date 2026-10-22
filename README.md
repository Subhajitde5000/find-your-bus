# find-your-bus

Kolkata bus timetable guide: a **static Next.js site** plus a **FastAPI + PostgreSQL backend** that
is kept for the database side of the project.

```
backend/   FastAPI + PostgreSQL. Loads an Excel directory into Postgres, serves a JSON API.
fontend/   Next.js site. Ships as static files and makes no API calls.
data/      Source workbooks, the sample routes, the route extension, and the data audits.
scripts/   build_static_data.py — the workbooks -> bundled JSON exporter.
           geocode_stops.py    — stop coordinates for the offline ride screen.
           build_route_geometry.py — road shapes for the ride map, from OpenStreetMap.
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
npm test             # journey-search, ride-engine, render and page tests (149 of them)
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
- **Landmarks** — `python scripts/build_landmarks.py --from-stops` (offline) marks stops whose names say what they are (bridges, stations, hospitals, colleges…) at the stop's own published position. `python scripts/build_landmarks.py --overpass` (needs internet) adds real OpenStreetMap rivers, canals, bridges and building outlines. Nothing is added by hand; each feature records its `source`.
