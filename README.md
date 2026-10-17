# find-your-bus

Kolkata bus timetable guide: a **static Next.js site** plus a **FastAPI + PostgreSQL backend** that
is kept for the database side of the project.

```
backend/   FastAPI + PostgreSQL. Loads an Excel directory into Postgres, serves a JSON API.
fontend/   Next.js site. Ships as static files and makes no API calls.
data/      Source workbooks, the sample routes, the route extension, and the data audits.
scripts/   build_static_data.py — the workbooks -> bundled JSON exporter.
```

The website does not call the backend. All timetable data is generated once into
`fontend/src/data/kolkata-bus-data.json`, bundled at build time, and read in the browser.

## Frontend (static site)

```bash
cd fontend
npm install
npm run dev        # http://localhost:3000
npm run build      # static export -> fontend/out
npm run lint
npm run typecheck
npm test             # journey-search regression tests (every route, both directions)
```

`npm run build` writes plain HTML/CSS/JS to `fontend/out`, which can be served by any static host
(nginx, S3 + CloudFront, Netlify, GitHub Pages, Vercel static output). There is no server, no
serverless function and no runtime data fetching.

### Regenerating the data file

The JSON is generated from the **v2** workbooks by a standalone script (no database, no backend):

```bash
python -m venv .venv
.venv/bin/pip install openpyxl
.venv/bin/python scripts/build_static_data.py
```

That reads:

1. `data/Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx`
2. `data/Kolkata_Bus_Stands_v2.xlsx`
3. `data/timetable_preview_routes.json`
4. `data/Kolkata_Bus_Routes_Extension-v3.xlsx` (the routes missing from v2; pass
   `--no-extension` to build from the v2 workbook alone)

and writes `fontend/src/data/kolkata-bus-data.json`. Re-run it whenever the workbooks change, then
rebuild the site. The script prints the counts and refuses to write if the workbook is internally
inconsistent (return stops not the outbound stops reversed, a run with the wrong number of times,
duplicate route numbers or run codes).

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
| `stops` | 152 unique stop names, each optionally linked to a stand |
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

Nothing in the site is live tracking.

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
