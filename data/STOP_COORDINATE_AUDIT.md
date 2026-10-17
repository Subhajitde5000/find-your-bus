# Stop coordinate audit

How every latitude/longitude in `data/stop_coordinates.json` was obtained, what was
rejected, and what is still missing. Written by `scripts/geocode_stops.py`; regenerate
with

```bash
.venv/bin/python scripts/geocode_stops.py          # datasets only
.venv/bin/python scripts/geocode_stops.py --osm    # + OpenStreetMap lookups for the gaps
```

Review the result in **`data/stop_coordinates_review.csv`** before trusting it. It has
one row per stop: the coordinate chosen, the source, the method, the name it matched
on, the alternatives that were considered, and an empty column to write a verdict in.

## Why this file exists

The offline ride screen matches the phone's GPS position against the stops of the route
the passenger is on. A stop without a position cannot take part in that match, and a
stop with the *wrong* position is worse than one with none: it puts the bus on the
wrong street and quietly gives the passenger wrong distances.

So the rule throughout is **nothing is invented**. A coordinate is copied, never
interpolated, averaged or estimated. A stop no source can place is left out, and the
ride screen says so.

## Sources

All of them are openly published, and two are already sources of this project (see
`scripts/import_external_routes.py`).

| Source | What is taken | Licence |
|---|---|---|
| `arkodeepg/calcutta-transport` `data/bus/stops.csv` | 2,362 city bus stops with `lat`/`lon`, each with a `coord_method` (`nominatim`, `osm_place`, `osm_stop`, `wikidata`, …) and a `coord_confidence` | ODbL 1.0 © OpenStreetMap contributors; GeoNames CC BY 4.0; Wikidata CC0 |
| … `data/bus/stop_aliases.csv` | their own evidenced alias rows, e.g. `Dalhousie` = `B.B.D. Bagh` (OSM node + Wikidata + Wikipedia) | as above |
| … `data/{rail,metro,tram,auto,ferry}/stops.csv` | other modes; the same crossing is often the bus stop | as above |
| … `gtfs/stops.txt` | their generated GTFS feed, for stops the CSVs miss | as above |
| … `docs/data/places.json` | an 18,179-place Kolkata gazetteer with alternate names | as above |
| `murmusuvash2-wq/busjatri-open-data` `data/stops.csv` | the only usable coordinate list for the long-distance towns (Durgapur, Siliguri, Malda, Farakka) on the intercity routes | see that repository |

Data fetched with `--osm` is additionally © OpenStreetMap contributors, ODbL 1.0.
**No OpenStreetMap API was reachable from this repository's build environment**, so
every coordinate in the committed file comes from the datasets above; `--osm` is there
for you to run on your own machine.

## Results

Measured on the committed file:

| | |
|---|---|
| Stops in the site dataset | 2,194 |
| Stops with a reviewed coordinate | **1,209** |
| — `high` confidence | 665 |
| — `medium` confidence | 448 |
| — `review` confidence | 96 |
| Rejected by the route-geometry check | 78 |
| Unresolved | 985 |
| Stops on routes that have a timetable | 163 |
| — of those, located | **148 (91%)** |
| Routes with at least two located stops | **650 of 650** |
| Timed routes with at least two located stops | **84 of 84** |

The last two rows are the ones that matter: every route the site ships can be followed,
so the ride screen is never unavailable for a route the timetable offers.

## How a coordinate is chosen

1. **Name matching.** Each stop name is tried through its aliases, then normalised, then
   with abbreviations expanded (`Rd` → `Road`, `Ave` → `Avenue`, `Stn` → `Station`), then
   with furniture words dropped (`Bus`, `Stand`, `Gate`, `No`). The first variant that
   matches wins, so an exact name outranks a looser form.
2. **Ranking.** Several sources can answer the same name. A bus stop from their bus
   dataset (tier 0) beats their GTFS feed (tier 2), which beats a metro station (tier 3),
   which beats the gazetteer (tier 5). Within a tier, `high` confidence beats `medium`.
3. **Confidence capping.** A match found only through an abbreviation or a dropped noise
   word is capped at `medium`. A gazetteer hit or a fuzzy token match is `review`.
4. **Geography.** Coordinates outside 21.0–27.5 N / 86.0–90.0 E are dropped as name
   collisions elsewhere in India.

## The route-geometry check

Name matching in Kolkata produces plausible-looking wrong answers, because the city, its
suburbs and the surrounding districts reuse short names. The route chains already in the
dataset expose those, and this check uses them.

For each route, for each stop that sits between two other located stops, the script
measures how far that stop is from the line joining its neighbours, and compares it with
the route's **own** median leg length — so a city route with stops every 1 km and an
intercity route with legs of 50 km are each judged fairly. A stop is rejected when it is
off its corridor more often than it is on one.

Example of what it catches:

- `Ramnagar` matched a `Ramnagar` 122 km from the stop before it on a route whose median
  leg is 9.7 km, on 22 routes against 2. Rejected.
- `B.T. College` matched a college in a different district, 59 km off a route whose
  median leg is 1 km. Rejected.
- `Malancha` is wrong on 3 routes (42 km off) but right on 14. Kept — the route that
  names it is the one that uses it.
- `Chiriamore` is 13.7 km off on 2 routes and correct on 32. Kept.

Without this check the file would look fine and the ride screen would be quietly wrong
on a handful of routes.

## What is missing, and why

**Unresolved on a timed route (15 stops).** These are names no source places:

`Amlasuli`, `Bandhaghat`, `Bonhooghly`, `Garia Depot`, `Goaltore`, `Kishanganj`,
`Moulali`, `Palbazar`, `Salkia`, `Shilpara` — plus, rejected by geometry:
`Chandrakona Town`, `Goura`, `Kadamtala`, `Ramnagar`, `Rathtala`.

Several are near-misses the script deliberately refuses to guess:

- `Moulali` — `calcutta-transport` publishes `Maulali` but with no coordinate.
- `Berhampore` — resolved to `Baharampur` (Murshidabad), the anglicised spelling of the
  same town, through an evidenced alias.
- `Salkia`, `Bandhaghat`, `Bonhooghly`, `Shilpara`, `Palbazar` — Howrah-side and
  northern stops with no coordinate in any source used.
- `Amlasuli`, `Goaltore`, `Kishanganj` — villages on the Radharani intercity service.

Running `--osm` on a machine with internet access is the intended way to fill these;
each hit is cached under `.cache/geocode/` and written as `confidence=review` for you to
check.

**Unresolved elsewhere (970 stops).** Almost all are on the 566 catalogue routes, which
have no timetable and therefore no ride screen. They are simply not needed yet.

## Confidence, and what it means

| | |
|---|---|
| `high` | Their bus dataset says so with `coord_confidence=high`, matched on the exact name. |
| `medium` | Either their confidence was `medium`, or the match needed an abbreviation, a dropped noise word, or another mode's stop. |
| `review` | A gazetteer hit or a fuzzy token match. **Check these in the review CSV.** |

The ride screen shows "position approximate" next to any `review` stop.

## Files

| | |
|---|---|
| `data/stop_coordinates.json` | The reviewed table, keyed by the exact stop name the site uses. Ordered by name and free of timestamps, so an unchanged run produces no diff. |
| `data/stop_coordinates_review.csv` | One row per stop with everything needed to check the choice, including the alternatives. |
| `fontend/src/data/kolkata-bus-data.json` | The site bundle. `scripts/build_static_data.py` merges the coordinates into each stop as `lat`, `lng` and `coordConfidence`. |
| `.cache/geocode/` | Downloaded datasets and OSM query cache. Git-ignored. |
