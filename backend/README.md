# Find Your Bus — Backend (FastAPI + PostgreSQL)

Backend for the Kolkata bus finder. It loads the two Excel directories in `../data` into PostgreSQL
and serves them through a read-only JSON API.

```
backend/
├── main.py                  FastAPI app (uvicorn entry point)
├── manage.py                CLI: create tables, import Excel data, export the frontend JSON
├── app/
│   ├── config.py            settings (DATABASE_URL, CORS_ORIGINS) from .env / environment
│   ├── db.py                SQLAlchemy engine, session, Base
│   ├── models.py            database tables (source of truth for the schema)
│   ├── schemas.py           API request/response models (Pydantic)
│   ├── importer.py          Excel → database loader
│   ├── stand_aliases.py     manual links from route place names to bus stand records
│   └── routers/             one module per resource (stands, stops, routes, buses, journeys …)
├── database/schema.sql      pg_dump of the resulting schema, for review
├── tests/                   pytest suite (runs against a real PostgreSQL)
├── requirements.txt
└── .env                     local settings (DATABASE_URL, CORS_ORIGINS)
```

## 1. Setup

Requires Python 3.11+ and PostgreSQL 14+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
createdb find_your_bus                                  # or create it in pgAdmin / psql
```

Set `DATABASE_URL` in `backend/.env` (see `.env.example`), e.g.
`postgresql+psycopg://postgres:postgres@127.0.0.1:5432/find_your_bus`.

## 2. Create tables and load the data

```bash
python manage.py init-db          # creates all tables
python manage.py import-data      # loads ../data/*.xlsx (refuses to run if data already exists)
python manage.py import-data --replace   # wipe these tables and reload from the Excel files
python manage.py export-static-data      # writes ../fontend/src/data/kolkata-bus-data.json
```

`export-static-data` reads the Excel files directly and does not need PostgreSQL. The frontend is a
static site that bundles that JSON, so it does not call this API; the endpoint list below is for the
database-backed side of the project and for rebuilding the data.

The import runs in one transaction; if anything fails nothing is written. Expected output:

```
stands:              80
operators:           8
service categories:  10
stops:               173 (54 linked to a stand)
routes:              87
route stops:         521
buses:               110
trips:               1048
trip schedules:      2096
```

## 3. Run the API

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health

The Next.js frontend is allowed by default via `CORS_ORIGINS`. It no longer calls the API at
runtime: see the project README for the static data file built by `export-static-data`.

## 4. API endpoints (all under `/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Database connectivity check |
| GET | `/operators` | Operators (WBTC Govt (AC Volvo), Private Operators Syndicate, …) |
| GET | `/service-categories` | Service types (AC Volvo Premium, Non-AC Trunk, Private Stage Carriage, …) |
| GET | `/stands?q=&category=&limit=&offset=` | Depots, terminals and route stands |
| GET | `/stands/{id}` | One stand, with the stops linked to it |
| GET | `/stops?q=&linked=&limit=&offset=` | Named points on routes (autocomplete source) |
| GET | `/routes?q=&operator_id=&service_category_id=&limit=&offset=` | Route list |
| GET | `/routes/{route_number}` | Route with ordered stops, terminals, fleet info, trip count |
| GET | `/routes/{route_number}/trips` | Every run of the route with its bus and times |
| GET | `/buses?q=&limit=&offset=` | Buses (search by registration, spaces optional) |
| GET | `/buses/{registration}` | One bus with all its runs; `WB 05 6214` or `WB056214` both work |
| GET | `/journeys/search?from_stop_id=&to_stop_id=&after=` | Routes that connect two stops, with departures |

List endpoints return `{"items": [...], "total": N, "limit": L, "offset": O}`.

### Journey search

`from_stop_id` and `to_stop_id` are stop ids from `/stops`. For every route that passes both:

- `direction` — `outbound` (origin → destination) or `return` (destination → origin).
- `schedule_available` — `true` only when the two stops are the route's two terminals.
  Timetables in the source cover terminals only, so for a stop in the middle of a route
  `departures` is empty and `schedule_available` is `false`.
- `departures` — each run with its bus registration (if known), sorted by departure time.
  `after=HH:MM` drops earlier departures.

## 5. Database structure

```
operators (1) ──< routes >── (1) service_categories
                    │  │
                    │  └── origin_stop / destination_stop ──> stops
                    │
                    ├──< route_stops >── stops >── bus_stands   (optional link)
                    │
                    └──< trips >── buses                       (bus optional)
                            └──< trip_schedules                (outbound + return times)
```

| Table | Rows | Holds |
|---|---|---|
| `bus_stands` | 80 | Depots, major passenger terminals, route stands: name, local name, category, operator division, address, role. `latitude`/`longitude` are empty for now. |
| `stops` | 173 | Every named point on a route. `bus_stand_id` links it to a stand when the match is clear. |
| `operators` | 8 | Operator names as given in each route sheet. |
| `service_categories` | 10 | Category per route. |
| `routes` | 87 | Route number, operator, category, origin/destination (with source labels), via text, documented fleet. |
| `route_stops` | 521 | Ordered stops of each route (`sequence` 1 = origin, last = destination). |
| `buses` | 110 | Registration number (`registration_no`) and normalised lookup key (`registration_key`). |
| `trips` | 1048 | One run (`RUN-S12-01`) of a route, optionally by a bus. |
| `trip_schedules` | 2096 | Outbound and return departure/arrival times for each trip. |

The full DDL is in `database/schema.sql`. The SQLAlchemy models in `app/models.py` are the source of truth;
regenerate the dump after changing them.

Schema design notes:

- `routes.origin_stop_id` / `destination_stop_id` duplicate `route_stops` sequence 1 and last, so that
  route lists do not need a join. The importer keeps them in sync.
- `buses.registration_key` is unique and normalised so that searches ignore spaces and case.
- `stops.name` is unique case-insensitively; a stop is shared by every route that uses that name.
- `trip_schedules` has one row per direction, so intermediate-stop times can be added later
  without changing the trip model.

## 6. Data notes (from the Excel files)

- **Bus numbers:** 1048 runs in total, 115 have a registration number (110 distinct buses). The rest
  are floating reserve buses or private-operator rosters with the registration left blank. These
  stay in `trips` with `bus_id = NULL`.
- **Route numbers:** the four minibus sheets are named `Route_MB_HG`, `Route_MB_HB`, `Route_MB_BT`,
  `Route_MB_AJ`. The importer takes the route number from the sheet's title line
  (`MB_Howrah_Garia` etc.) so it matches the master index.
- **Stand links:** 54 of 173 stops are linked to a bus stand (exact name, local name, or the alias
  list in `app/stand_aliases.py`). 41 terminal names used by routes are not linked yet, for example
  *Barasat Champadali Stand*, *Garia 6 No. Stand*, *Barrackpore Court*, *Digha Bus Stand*.
  Add a line to `stand_aliases.py` once you confirm a match, then re-run `import-data --replace`.
- **Timetables:** times come straight from the spreadsheets. They are not checked against official
  schedules.
- **Fleet numbers:** `documented_fleet_count` is parsed from the master index ("14 Active WBTC Buses").
  Private routes have no count.

## 7. Tests

```bash
createdb find_your_bus_test
pytest -q
```

Tests use `TEST_DATABASE_URL` (default `postgresql+psycopg://postgres:postgres@127.0.0.1:5432/find_your_bus_test`).
The schema is rebuilt and the Excel data is loaded for each run. Do not point this at production.

## Not in this version

- Authentication and write endpoints (the API is read-only).
- Migrations (Alembic). The schema is created with `init-db`; add Alembic once the schema starts changing in production.
- Coordinates for stands and stops, and stop-level times for intermediate stops.
- Searching by stand (currently by stop id; a stand can have several stops).
