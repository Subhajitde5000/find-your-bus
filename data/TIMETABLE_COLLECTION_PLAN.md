# Timetable collection plan — 15 October 2026

The website can only show what the route sheets prove. Today
**47 of 468 routes have a published timetable** and
**421 do not**; the unconfirmed ones are listed without times and are
hidden from journey search until the transport office confirms them
(see `MISSING_DATA_AUDIT.md`, "Publication gate").

This plan covers the fastest way to turn that around: what to collect, where it goes, who signs it
off, and which routes to start with.

## 1. What to collect for every route

One line per route is enough for a first pass — the fields already exist as columns:

| Field | Where it goes | Notes |
|---|---|---|
| First bus time (each direction) | route sheet timetable table + `Timetable Source` column | the real first departure from each terminus |
| Last bus time (each direction) | same | the real last departure from each terminus |
| Frequency / headway | same | e.g. "every 15-20 min in peak, 30 min off-peak" |
| Number of buses actually running | `Documented Fleet Allocation` column | replaces the current estimate where it exists |
| Registrations (if the roster gives them) | run table `Bus (Registration)` column | one row per run, as the depot works it |
| Who supplied it and when | `Timetable Source` column | e.g. "Tollygunge depot roster, 12 Nov 2026" |
| Permission to publish | `May Publish` column | "yes" only when the source agrees to publication |

Rules the code now enforces, so nothing slips through:

- A route is published **only** when the Master Index row says `Verified = yes`.
- `Verified = yes` requires the sheet to carry runs (the export test fails otherwise).
- Everything else is exported with no times, tagged *Timetable pending* in the route list, and
  filtered out of journey search.
- No estimated, sampled or interpolated departure is produced anywhere.

## 2. Where each field is edited

1. Open `data/Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory.xlsx`.
2. Fill the route sheet's timetable table (Run / Trip ID, bus, out and return times, notes).
3. Fill the Master Index row: `Documented Fleet Allocation`, `Timetable Source`, `May Publish`.
4. Set `Verified` to `yes` only once the office has confirmed it.
5. Re-run the exporter and rebuild:

```bash
cd backend
python manage.py export-static-data     # writes fontend/src/data/kolkata-bus-data.json
python -m pytest -q                     # data invariants, including the verification gate
cd ../fontend && npm run build
```

## 3. Work order (proposed)

### Step 1 — confirm the 40 routes whose times look templated (no new collection needed)

These sheets already carry 12 runs each, but the pattern is identical on every one of them and no
bus registration is recorded, so the audit flagged them as templated rather than rostered. One
confirmation call to the private syndicate / depot settles 40 routes at once:

`1`, `12C`, `12C_1`, `205`, `206`, `212`, `215`, `218`, `222`, `230`, `235`, `240`, `24A`, `3`, `30C`, `32A`, `34C`, `44`, `45`, `47_1`, `78`, `7A`, `80A`, `91`, `DN2`, `DN8`, `KB16`, `KB22`, `LD_Asansol`, `LD_Bakkhali`, `LD_Digha`, `LD_Durgapur`, `LD_Mayapur`, `LD_Siliguri`, `MB_Airport_Jadavpur`, `MB_Baghbazar_Taratala`, `MB_Howrah_Behala`, `MB_Howrah_Garia`, `SD4`, `SD8`

Expected result: `Verified = yes` on the ones the operator confirms, with the source recorded and
the published times corrected where the roster differs.

### Step 2 — the 40 busiest corridors with no timetable at all

Ranked by the number of *major passenger terminals and depots* the corridor touches (a data-driven
proxy from the stands workbook — not measured passenger loads; the office should reorder this if it
knows better):

| # | Route | Operator | Corridor | Stops | Major hubs |
|---|---|---|---|---|---|
| 1 | `55` | Private | Botanical Garden Bus Terminus → Esplanade | 7 | 5 |
| 2 | `RT10` | Private | Bally Khal → Khidirpur | 7 | 5 |
| 3 | `AC55` | WBTC (AC Volvo) | Naihati Bus Terminus → New Town | 10 | 4 |
| 4 | `C37` | WBTC (CTC Division) | Howrah Railway Station → Amtala Bus Stand | 10 | 4 |
| 5 | `S64` | WBTC (Non-AC Trunk) | Naihati Bus Terminus → New Town | 10 | 4 |
| 6 | `SD82` | Private | Esplanade → Kakdwip Lot 8 Bus Terminus | 9 | 4 |
| 7 | `12C_1B` | Private | Joka Bus Terminus → Howrah Railway Station | 8 | 4 |
| 8 | `56` | Private | Sodepur Drop Gate → Howrah Railway Station | 8 | 4 |
| 9 | `C38` | WBTC (CTC Division) | Howrah Railway Station → Joka Bus Terminus | 8 | 4 |
| 10 | `SD19` | Private | Esplanade → Patharpratima Bus Stand | 8 | 4 |
| 11 | `59` | Private | Bakultala Bus Terminus → Esplanade | 7 | 4 |
| 12 | `81_1` | Private | Barasat Champadali Stand → Rajchandrapur | 7 | 4 |
| 13 | `MM3` | Private | Dakshineswar Bus Terminus → Duttapukur Bus Stand | 7 | 4 |
| 14 | `54` | Private | Bally Khal → Esplanade | 6 | 4 |
| 15 | `RT6` | Private | Botanical Garden Bus Terminus → Esplanade | 5 | 4 |
| 16 | `RT6A` | Private | Danesh Sheikh Lane Bus Terminus → Esplanade | 5 | 4 |
| 17 | `12` | Private | Badartala Bus Stand → Rajabazar Depot | 10 | 3 |
| 18 | `30B` | Private | Gouripur Bus Terminus → Babughat Terminus | 10 | 3 |
| 19 | `DN17` | Private | Barasat Champadali Stand → Babughat Terminus | 9 | 3 |
| 20 | `S23` | WBTC (Non-AC Trunk) | Karunamoyee → Howrah Railway Station | 9 | 3 |
| 21 | `S59` | WBTC (Non-AC Trunk) | Karunamoyee → Howrah Railway Station | 9 | 3 |
| 22 | `VS6` | WBTC (WBSTC Surface) | Diamond Harbour Bus Terminus → Esplanade | 9 | 3 |
| 23 | `12C_1A` | Private | Joka Bus Terminus → Howrah Railway Station | 8 | 3 |
| 24 | `18A` | Private | Sakuntala Park Bus Stand → Howrah Railway Station | 8 | 3 |
| 25 | `30D` | Private | Dum Dum Cantonment Bus Terminus → Babughat Terminus | 8 | 3 |
| 26 | `DN44` | Private | Bongaon Bus Stand → Dakshineswar Bus Terminus | 8 | 3 |
| 27 | `S113` | Private | Harinavi → Howrah Railway Station | 8 | 3 |
| 28 | `S124` | Private | Garia 6 No. Stand → Howrah Railway Station | 8 | 3 |
| 29 | `S12E` | WBTC (Non-AC Trunk) | Ecospace → Howrah Railway Station | 8 | 3 |
| 30 | `SD18` | Private | Diamond Harbour Bus Terminus → Esplanade | 8 | 3 |
| 31 | `17` | Private | Chetla Bus Stand → Howrah Railway Station | 7 | 3 |
| 32 | `18D` | Private | Sarsuna Bus Terminus → Howrah Railway Station | 7 | 3 |
| 33 | `208` | Private | Kudghat → Howrah Railway Station | 7 | 3 |
| 34 | `61` | Private | Alampur Bus Stand → Howrah Railway Station | 7 | 3 |
| 35 | `C30` | WBTC (CTC Division) | Rajabazar Depot → Sankrail Bus Stand | 7 | 3 |
| 36 | `M14` | Private | Dakghar → Howrah Railway Station | 7 | 3 |
| 37 | `RT31` | Private | Makardaha → Exide | 7 | 3 |
| 38 | `S110` | Private | Golf Green Bus Terminus → Howrah Railway Station | 7 | 3 |
| 39 | `S112` | Private | Garia 6 No. Stand → Howrah Railway Station | 7 | 3 |
| 40 | `S126` | Private | Maheshtala Bus Terminus → Howrah Railway Station | 7 | 3 |

The `Stops` and `Major hubs` columns come straight from the current sheets, so an officer can check
at a glance whether the corridor itself is right before spending time on times.

### Step 3 — the remaining 341 routes

That is the 421 routes without a published timetable, minus the 40 in step 1 and the 40 in step 2.
Collect in operator batches (WBTC depot by depot, then the private syndicate family by family) so
each batch can be confirmed and published together.

## 4. What NOT to do

- Do not fill a time, a fleet size or a registration from memory, from an enthusiast list, or from a
  pattern that "looks about right". A blank cell is published as *no timetable yet*; a wrong cell is
  published as a fact.
- Do not set `Verified = yes` before the source has agreed to publication.
- Do not add a row for a route number that is already used for a different corridor — the number
  conflicts listed in `MISSING_DATA_AUDIT.md` (§C, §H) still need the office's ruling first.
