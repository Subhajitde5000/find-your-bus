# find-your-bus

Kolkata bus timetable guide: a **static Next.js site** plus a **FastAPI + PostgreSQL backend** that
is kept for the database side of the project.

```
backend/   FastAPI + PostgreSQL. Loads the Excel directories into Postgres, serves a JSON API.
fontend/   Next.js site. Ships as static files and makes no API calls.
data/      Source data: the two Excel directories + the sample routes extracted from the frontend.
```

The website no longer calls the backend. All timetable data is generated once into
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

The JSON is generated from `data/` by the backend exporter (it only reads the Excel files, it does
not need PostgreSQL):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py export-static-data
```

That writes `fontend/src/data/kolkata-bus-data.json`. Re-run it whenever the spreadsheets change,
then rebuild the site.

### What is in the data file

| Key | Contents |
|---|---|
| `stands` | 193 depots, terminals and route stands from `Kolkata_Bus_Stands_v2.xlsx` |
| `stops` | 398 unique stop names, each optionally linked to a stand |
| `buses` | 110 vehicle registration numbers |
| `routes` | 468 routes: 460 from the directory, 8 sample routes with frequencies |
| `meta` | counts, and a `dedupe` record of everything that was merged or skipped |

De-duplication rules applied by the exporter (all recorded under `meta.dedupe`):

- **Routes** are unique by number. The 20 sample routes that used to live in
  `timetables.ts` were merged in; the 12 whose numbers the directory already covers with
  real run times are dropped in favour of the directory entry, and the other 8 are kept.
  A directory sheet with no runs at all never displaces a sample route, so the site keeps
  the timetable information it already had (listed under
  `samplesKeptOverBlankDirectoryRoutes`).
- **Stops** are unique by name ignoring case, spaces and punctuation, so `E.M. Bypass` and
  `EM Bypass` become one stop. Names that resolve to the same bus stand also become one stop
  (`Esplanade` + `Esplanade Curzon Park` → `Esplanade Curzon Park`). A route never lists the same
  stop twice; the routes where a stop had to be collapsed are listed under
  `collapsedRouteStops`.
- **Buses** are unique by normalised registration (`WB 05 6214` == `WB056214`).
- **Trips** are unique by run code; **operators** and **service categories** by name.

### Kinds of departure

The site never shows a time that is not backed by the data.

- **Scheduled** — a run from the directory, searched between the route's two terminals. Outbound
  searches use the outbound times and return searches use the return times.
- **Approximate** (shown with a `~`) — the same real runs, searched between two stops that are not
  both terminals. The directory publishes times only at the terminals, so the time at a stop in
  between is worked out from that run's real terminal times (equal time per stop, in the direction
  the bus is travelling). It can be off by several minutes. Changes between approximate buses get a
  10 minute margin instead of 4.
- **Sample** — a route from the preview list using its first/last/every frequency.
- **No timetable** — a route with no published times is listed as "connects your stops, no
  timetable yet" with no times at all. Nothing is generated for it.

A journey and its reverse use the times of the direction the bus actually travels, so they never
show the same list. `npm test` checks this for every route and every pair of its stops.

Nothing in the site is live tracking.

## Backend

See [`backend/README.md`](backend/README.md). It is unchanged apart from the new
`export-static-data` command, which is only used to build the frontend data file.

```bash
cd backend
python manage.py init-db
python manage.py import-data            # Excel -> PostgreSQL
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Data notes

Times come straight from the spreadsheets and are not checked against official schedules.
Sample routes carry illustrative frequencies. See the "Data notes" section of the backend README
for the known gaps (stand links, coordinates, intermediate-stop times).
