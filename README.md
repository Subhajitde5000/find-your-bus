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
| `stands` | 193 depots, terminals and route stands from `Kolkata_Bus_Stands_v2.xlsx`, each with a `verified` flag |
| `stops` | 387 unique stop names, each optionally linked to a stand |
| `buses` | 110 vehicle registration numbers |
| `routes` | 468 routes: 466 from the directory and 2 preview corridors, each with `verified` and `timetableSource` |
| `meta` | counts, and a `dedupe` record of everything that was merged or skipped |

De-duplication rules applied by the exporter (all recorded under `meta.dedupe`):

- **Routes** are unique by number, and the directory always wins: the corridors that used to live
  in `timetables.ts` (now `data/preview_route_corridors.json`) are only exported for the 2 route
  numbers the directory does not contain at all. The rest are listed under
  `skippedPreviewRoutes`.
- **Verified routes only.** The Master Index `Verified` column decides what is published. A route
  marked `no` keeps its corridor but is exported with no trips, tagged *Timetable pending* in the
  route list, and left out of journey search.
- **Stops** are unique by name ignoring case, spaces and punctuation, so `E.M. Bypass` and
  `EM Bypass` become one stop. Names that resolve to the same bus stand also become one stop
  (`Esplanade` + `Esplanade Curzon Park` → `Esplanade Curzon Park`). A route never lists the same
  stop twice; the routes where a stop had to be collapsed are listed under
  `collapsedRouteStops`.
- **Buses** are unique by normalised registration (`WB 05 6214` == `WB056214`).
- **Trips** are unique by run code; **operators** and **service categories** by name.

### Departures

Every departure shown is a **scheduled run published in the directory**, at one of the two
terminals of a **verified** route, and it names the run code and (where the sheet records one) the
bus. There is nothing else:

- No estimated departures, no sample or interpolated frequencies, and no fixed journey time.
- A route that serves both stops but has no published times for that pair says
  *"This route connects your stops. No timetable yet."* and shows no times.
- A route the transport office has not confirmed yet is tagged *Timetable pending* in the route
  list and never appears in journey search.

Nothing in the site is live tracking. See `data/TIMETABLE_COLLECTION_PLAN.md` for how the remaining
routes get their real first bus, last bus and frequency, and `data/MISSING_DATA_AUDIT.md`
("Publication gate") for what is published today.

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

Times come straight from the spreadsheets, only for routes marked `Verified = yes`, and are not
checked against official schedules. 47 of 468 routes are published today; the other 421 are listed
without times until the transport office confirms them. See the "Data notes" section of the backend
README for the known gaps (stand links, coordinates, intermediate-stop times).
