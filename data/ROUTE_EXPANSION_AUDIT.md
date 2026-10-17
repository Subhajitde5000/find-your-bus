# Route expansion audit — 567 routes added from published route lists

Date: 17 October 2026. Companion to `DATA_SOURCE_CONFLICT.md` and `DIRECTION_BUG_AUDIT.md`.

## 1. Why this pass exists

The v2 workbook is complete but small: 75 routes. Searching for a common trip such as
**Howrah Railway Station → Salt Lake Sector V** returned only one route (the sample S12E), while
215A, 215A/1, 44A, RT-5 and RT-29 all run that corridor. This pass adds the missing route numbers
and their stop chains, and adds every long-distance service for which a genuine stop-by-stop
timetable is published.

## 2. Sources, and what each one actually contains

| Source | What it publishes | What it does **not** publish |
|---|---|---|
| **WBTC city route list** — `wbtconline.in/wbtc-city-bus-routes` (via `arkodeepg/calcutta-transport`) | route number, origin, destination, stoppage chain | **no times at all** |
| **Bus-O-Pedia** — `kolbusopedia.com/bus-routes` and `/bus-routes-government` (via the same dataset) | route number, section/operator class, origin, destination, stop chain | no times |
| **OpenStreetMap** route relations (15 routes only) | stop order for numbers neither list carries | no times |
| **BusJatri open data** — `murmusuvash2-wq/busjatri-open-data` (CC BY 4.0) | for long-distance services: operator, registration number, fare and a time at **every stop** | city buses have blank times by design |

The datasets were fetched from GitHub on 17 October 2026:

- `codeload.github.com/arkodeepg/calcutta-transport/tar.gz/refs/heads/main`
- `codeload.github.com/murmusuvash2-wq/busjatri-open-data/tar.gz/refs/heads/main`

`scripts/import_external_routes.py` is the reproducible importer.

### Why no city stop times were added

Every public source that appears to publish Kolkata city stop times states that the times are
estimated:

- **BusJatri**, on a city route page: *“Stop times estimated from the trip departure + route length.
  Verify before travel.”*
- **citybustimetable.com**, on every route page: *“Departure times are estimated, assumed per stop.”*
- **calcutta-transport**, in its GTFS build report: *“Default 15 min headway, times estimated from
  distance”*, and every `travel_min_from_start` cell in its bus CSVs is blank.

Under the project rule — real data only, blanks stay blank — none of those estimates was imported.
A city route therefore carries its **real number, operator, termini and full stop chain, and no
time at all**. The site already knows how to show that: `findRouteLinks` lists the bus with
“no published timetable yet” and never invents a departure.

## 3. What was added

| Item | Count |
|---|---:|
| Routes in the extension workbook | **567** |
| — catalogue routes with no timetable | 566 |
| — long-distance services with a complete stop-by-stop timetable | 1 |
| Routes in the site after the merge | **650** |
| — v2 directory | 75 |
| — sample | 8 |
| — catalogue | 566 |
| — externally timed | 1 |
| Stops in the site | **2,194** (was 152) |
| Directional runs | **1,058** (was 1,056) |
| Route-stop records | **11,526** |

Catalogue routes by provenance and confidence:

| Provenance | Routes |
|---|---:|
| Bus-O-Pedia only (`kolbusopedia`) | 437 |
| WBTC list and Bus-O-Pedia agree (`wbtc_routes;kolbusopedia`) | 71 |
| WBTC list only (`wbtc_routes`) | 44 |
| OpenStreetMap only (`osm`) | 14 |

115 catalogue routes are `verified` (present in WBTC's own list); 451 are `community`
(Bus-O-Pedia or OSM only). The site labels both.

### The one externally timed service

`RADHARANI` (WB33M7249, Radharani Paribahan) — Amlasuli → Karunamoyee, 15 stops, times published
at every stop in both directions by `bussathi.in` (via BusJatri). It is the only service in the
BusJatri dataset that both touches a Kolkata terminal and has a complete column. Its upward and
downward times become two directional runs; the down column is reversed so the return run travels
Karunamoyee → Amlasuli in order.

## 4. De-duplication rules

1. **A route already in v2 is not repeated.** 18 rows were dropped because the same
   number runs between the same two termini (for example `S-24 Kamalgazi – Howrah`,
   `205 Bansdroni – Babughat`, `230 Alipore Zoo – Kamarhatti`).
2. **Same number, different route → labelled variant.** 54 routes were added with their termini in
   the number, e.g. `15 (Ultadanga – Howrah Railway Station)` (v2's `15` is Munshirhat – Howrah),
   `3 (Dahighat – Sealdah)`, `C11 (Belgachia/ BBD bag/ Sealdah – Domjur bus Stand)` (v2's `C11` is
   Howrah – Tollygunge). Nothing is overwritten; both are searchable.
3. **Duplicate numbers inside the new list** get the same treatment, e.g. `72 (Basirhat – Nazat)`
   and `78/1 (Parthapur – Babughat)`.
4. **Loop routes are left out.** 20 catalogue routes visit the same stop twice (an out-and-back
   through Eco Park, or an explicitly “Circuitous” route). One linear stop list cannot represent
   them without inventing a shape, so they are excluded rather than flattened. Examples:
   `253`, `91C`, `AC-38`, `S-30A`, `S30A(IT Special)`.
5. **Stops are merged only when certain.** The importer maps spelling, punctuation and
   generic-suffix variants (`Airport 1no` → `Airport 1 No.`, `Park Circus 7 Point` →
   `Park Circus 7-Point`, `Dunlop More` → `Dunlop`, `Sarsuna Bus terminus` → `Sarsuna`,
   `Garia Bus Stand` → `Garia 6 No.` — the stands workbook gives “Garia Bus Stand” as that stand's
   local name). Everything else keeps the name its source prints. No stop is added from a route's
   prose description.

## 5. Verification

- `cd fontend && npm test` — **35 tests pass**, including every stop pair of every route that has
  times (1,770 v2/sample pairs plus the new service), the catalogue/no-timetable rule, and the
  externally timed service's direction.
- `python scripts/build_static_data.py` reads both workbooks; the extension workbook is the source
  of the 567 new routes. Re-running it is deterministic.
- `npm run typecheck`, `npm run lint`, `npm run build` — clean.
- Spot check: **Howrah Railway Station → Salt Lake Sector V** now returns 23 timed sample trips
  *and* five real route links — `44A`, `215A`, `215A/1`, `RT-5`, `RT-29` — each labelled with its
  provenance and with no invented time. `Chetla → Paikpara` returns route `33` as a link and
  **zero** timed trips.

## 6. What is still impossible from public data

- **Per-route fleets and bus numbers for city routes.** WBTC publishes no allocation, and no
  operator lists which bus runs which trip. Only the long-distance timetable names a registration
  (WB33M7249). Nothing was guessed.
- **City stop times.** See §2. The only honest state is blank.
- **Frequencies.** No source publishes a sourced headway for these routes; the GTFS default of
  15 minutes is an assumption, not data, and is not used.
