# Missing-data audit — 15 October 2026

Scope of this pass: **Excel files only.** The website data file
(`fontend/src/data/kolkata-bus-data.json`) was **not** regenerated and no
website code was touched, as instructed. Everything added below is a
*candidate for verification* by the transport office. Where a time, a bus
registration, a fleet count, an address or a facility could not be verified
from a published source, the field was **left blank** — nothing was invented,
and no image/photo data was added anywhere.

## How the check was done

1. **Cross-check inside the two workbooks.** Every place named as an origin,
   destination or via-stop on all 223 route sheets was compared with the
   stands workbook (stand name, local/common name, and the alias list in
   `backend/app/stand_aliases.py`).
2. **External check.** Published route/terminal lists (sources at the bottom)
   were compared route-by-route against the Master Index. Only routes whose
   number, operator family and both terminals could be read from a published
   list were added.
3. **No duplicates.** Short/variant terminal names that are the same physical
   stand as an existing row were *not* added again (table B). Slash-numbered
   private routes (e.g. `3C/1`, `12C/2`, `91B`) were not added, because this
   workbook already uses `_` ambiguously for them (`47_1`, `C26_1`) and the
   office should settle the naming convention first.

## A. What was added

### A1. Bus stands — 25 new rows (SL 135–159) in `Kolkata_Bus_Stands_v2.xlsx`

Official terminals published by the Transport Department / WBTIDCL for Howrah
and South 24 Parganas that had no row at all (address = town + district only,
role left blank):

| SL | Stand |
|---|---|
| 135 | Bagnan Bus Terminus |
| 136 | Uluberia Bus Terminus |
| 137 | Udaynarayanpur Bus Terminus |
| 138 | Gadiara Bus Terminus |
| 139 | Raidighi Bus Terminus |
| 140 | Usthi Bus Terminus |
| 141 | Kakdwip Lot 8 Bus Terminus |
| 142 | Diamond Harbour Bus Terminus |
| 143 | Kachuberia Bus Terminus |

Terminals of routes in table A2 (and of the cross-check) that had no
equivalent row under any name. Address and functional role left **blank**
(unverified):

| SL | Stand |
|---|---|
| 144 | Dum Dum Station Bus Stand |
| 145 | Naihati Bus Terminus |
| 146 | Kankurgachi Bus Stand |
| 147 | Madhyamgram Bus Stand |
| 148 | Munshirhat Bus Stand |
| 149 | Sankrail Bus Stand |
| 150 | Domjur Bus Stand |
| 151 | Badartala Bus Stand |
| 152 | Barisha Bus Stand |
| 153 | Sinthee Bus Stand |
| 154 | Dhakuria Bus Stand |
| 155 | Picnic Garden Bus Stand |
| 156 | Alampur Bus Stand |
| 157 | Dasnagar Bus Stand |
| 158 | Kadamtala Bus Stand |
| 159 | Kanchrapara Bus Stand |

Totals now: **159 stands** (28 depots, 56 major terminals, 75 route stands).

Also fixed: the summary formulas in row 5 only counted rows up to SL 80, so
the counts shown at the top of the sheet were stale. They now count the full
table.

### A2. Bus routes — 63 new route sheets (SL 161–223) in the routes workbook

Each new route has a Master Index row (with a working sheet link), a cloned
route sheet with operator, category, both terminals and via-stops, and an
**empty timetable table** — first/last bus, frequency, fleet size and bus
registrations are **blank** because they could not be verified. Do not publish
these sheets until the office supplies/confirms times and fleet.

WBTC (AC): `AC9B, AC36, AC38, AC55, AC59, AC24A, AC37A, AC37C`
WBTC (S): `S3B, S3W, S5N, S7N, S9A, S12D, S12E, S12G, S23, S30, S34B, S37A, S57, S62, S64`
WBTC (CTC C): `C11_1, C14_1, C20, C23A, C30, C37, C38`
WBTC (WBSTC Surface): `VS6, VS10, VS12, VS14A, ST7, ST12`
Private (blue-yellow): `12A, 13, 17, 21, 30A, 30B, 30D, 34B, 37, 37A, 39, 43, 44A, 46, 52, 54, 55, 59, 61, 63, 71, 73, 75, 79B, 79D, 80B, 85`

Totals now: **223 routes** (156 Govt/WBTC, 61 private syndicate, 6 long-distance).
87 routes have timetable rows; **136 route sheets — including all 63 new ones
and 73 pre-existing ones — have no trips yet.**

Also fixed in the Master Index:

- The summary formulas only counted the first 93 route rows; `Govt (WBTC)`
  counted the text `*Government*`, which never appears in the operator column
  (it says `Govt`), so it always showed 0; `Long Distance` likewise never
  appears in that column. All three now count the full table / the `LD_`
  route numbers.
- 73 Master Index rows (the previous expansion, roughly SL 95–160) had lost
  their `Go to … →` sheet hyperlinks; all 223 rows now link to their sheet,
  including the four minibus sheets (`Route_MB_HG` etc.).

No pre-existing stand row, route row, trip, time or registration was changed
or deleted — verified cell-by-cell against a backup.

## B. Route terminals that are NOT missing (matched, not duplicated)

These names appear on route sheets but have no stand row *under that exact
name*. As a transport officer's judgement they are the same physical stand as
an existing row, so no duplicate row was added. The office should confirm each
pair; after confirmation the clean fix is an alias in
`backend/app/stand_aliases.py`, not a new stand.

| Name used on routes | Existing stand (SL) |
|---|---|
| Dum Dum Park | Dum Dum Park Bus Terminus (45) |
| Eden City Maheshtala | Maheshtala Bus Terminus (51) / Eden City–Budge Budge Stand (72) |
| Haridevpur | Haridevpur Bus Stand (68) |
| Jadavpur | Jadavpur 8B Bus Terminus (34) |
| Kudghat | Kudghat Bus Terminus (37) |
| Lake Town | Lake Town / Jaya (110) |
| New Town | New Town International Terminal (33) |
| Patuli | Patuli (45 Stand) (65) |
| Salt Lake Depot Gate | Salt Lake Depot (9) |
| Sapoorji Estate | Shapoorji Depot (25) — note spelling: Sapoorji vs Shapoorji |
| Thakurpukur | Thakurpukur 3A Bus Stand (49) or Thakurpukur Depot (11) — **ambiguous, confirm which** |

Via-only stops (e.g. Exide, Taratala, VIP Road, BT Road, Khidirpur, Garia,
Dhakuria) are stops/crossings, not bus stands, and were not added as stands.

## C. Existing entries that conflict with published lists — NOT changed

These were left exactly as they are for the office to adjudicate; changing
them silently would have destroyed the existing timetable rows attached to
some of them.

| Route | In this workbook | Published list says |
|---|---|---|
| AC24 | Barasat → Garia | Patuli → Howrah (and AC24A Kamalgazi → Howrah, now added) |
| AC37 | Gariahat Crossing → Airport Gate 1 | Barasat/Garia → Airport (several variants) |
| AC39 | Howrah → Chinsurah Court | Airport Terminal → Howrah |
| AC43 | Dakshineswar → Golf Green | Golf Green → Airport Terminal |
| AC47 | Kudghat → Ecospace | Kudghat → Unitech / Shapoorji |
| AC50A | Garia → Rathtala | Garia → Rajchandrapur (Rathtala–Howrah is AC54) |
| S3A | Thakurpukur 3A → Karunamoyee | Thakurpukur → Sealdah / Rajabazar |
| S9 | Garia → Karunamoyee | Jadavpur → Karunamoyee |
| S23A / AC23A | Bally Khal → Salt Lake Depot (Gate) | Karunamoyee → Rajchandrapur (Ballyhalt) |
| S30A | Ultadanga → Karunamoyee | Bidhannagar Station circular (IT special) |
| C28 | Howrah → Barasat | Howrah → Barrackpore Court |
| C39 | Howrah → Kalyani Simanta | Rajabazar Tram Depot → Nabanna |
| C43 | Howrah → Habra | Habra → Garia |
| C26_1 | Howrah → Kamalgazi More | appears to be the same route as published C26A — possible duplicate of a renamed route |
| E18 | Howrah → Salt Lake Karunamoyee | Esplanade → Dhamakhali |
| 1 | Ramrajatala → Mukundapur | private 1 is Ramnagar → Mukundapur (the file's row may be a minibus) |
| 12C / 12C_1 | Howrah → Silpara / Parnasree | 12C is Pailan → Howrah; 12C/1 is Shibrampur → Howrah |

## D. Deliberately NOT added in this pass

- The remaining private, minibus, DN/SD/KB and 200-series routes (100+
  numbers, many slash-numbered, some defunct or Howrah/South-24-Parganas
  local). Adding them responsibly needs the RTA permit lists, not enthusiast
  lists alone.
- WBTC long-distance `D`, `E` and `ST` district routes beyond the Kolkata
  Metropolitan Area (Basanti, Dhamakhali, Karimpur, Purulia, etc.). The six
  `LD_*` sheets already cover the main long-distance corridors.
- Any route published as defunct, and any first/last time, frequency, fleet
  count or registration number that appears in only one unverified list.
- Coordinates for any stand — no verified source was used for lat/long, and
  the stands sheet has no such columns.

## E. Next step (needs your + transport office confirmation)

1. Confirm/ correct tables B and C, and fill the blank timetable, fleet,
   address and role fields for the new rows in A.
2. Only after that, tell me to proceed: aliases in `stand_aliases.py`,
   re-import / re-export, and regenerate the website data file — the website
   will then show the new stands and routes.

---

# Second pass — 15 October 2026 (private routes & buses per route re-checked)

Requested re-check: (1) private routes still missing, (2) buses on a route
missing. **Only genuine published data was added — no imagined times, fleet
sizes or registration numbers.**

## F. Private routes added in this pass — 243 routes (Master Index SL 224–466)

The full numbered private network published by Kolkata Bus-o-pedia
(blue-yellow ordinary, 200-series, DN, SD, K/KB, S-series minibuses,
RT-series Howrah minibuses, M/MM/MN minibuses, Howrah E43/E53) was compared
number-by-number with the workbook. Every published number not already
present was added with its published terminals and major via-stops;
timetable, fleet and registrations left **blank**.

- Blue-yellow: 1A, 1B, 3B, 3C_1, 3C_2, 3D, 12, 12AD, 12B, 12C_2, 12C_1A,
  12C_1B, 13A, 13C, 18A, 18B_1, 18C, 18D, 21_1, 23, 24, 24A_1, 24B, 28,
  30C_1, 39A_2, 40A, 40B, 41, 41B, 42A, 42B, 44_1, 45A, 45B, 46B, 47B, 51,
  55A, 56, 57, 57A, 64, 67, 67B, 68, 69, 70, 72, 72A, 76, 77, 77A, 79, 80,
  81, 81_1, 83, 87, 87A, 88, 91A, 91B, 91C, 92, 92A, 93, 95
- 200-series: 201, 202, 204_1, 205A, 208, 210, 211, 211A, 213, 213A, 214,
  214A, 215_1, 215A, 215A_1, 217, 217A, 217B, 219, 219_1, 221, 223, 227,
  228, 234, 234_1, 237, L238, 239, 240_1, 241, 242, 253, 259, 260
- DN: DN2_1, DN5, DN9_1, DN12, DN13, DN13A, DN16_1, DN17, DN18, DN19, DN26,
  DN28, DN35, DN38, DN43, DN44, DN46, DN47
- SD: SD3, SD5, SD9, SD11, SD11_1, SD14, SD16, SD18, SD19, SD22_1, SD26,
  SD27, SD29, SD30, SD33, SD39, SD50, SD51, SD53, SD63, SD64, SD82, SD85, SD94
- K/KB and Howrah E: K1, K4, K11, KB12, KB15, KB17, KB21, E43, E53
- S-minibuses: S101–S189 series as listed in the workbook (43 routes)
- RT-minibuses: RT1–RT42 series as listed in the workbook (34 routes)
- M/MM/MN: M14, M15, M16, MM3, MM5, MM6, MM6_1, MM7, MN2, MN3, MN6

Naming: a slash in a published number is written `_`, the convention this
workbook already uses (`47_1`, `12C_1`): e.g. `3C_1` = 3C/1, `204_1` = 204/1,
`DN16_1` = DN16/1, `S101_1` = S-101/1. Hyphens are dropped (`DN-17` → DN17).

**Stands added with them (SL 160–193):** Bongaon, Basirhat, Baduria,
Hasnabad, Hakimpur, Dhamakhali, Haroa, Ghatakpukur, Canning, Joynagar,
Sonarpur, Patharpratima, Noorpur, Falta, Amta, Nimta, Belgharia, Ahiritola,
Kamarhati, Salkia, Chanditala, Raichak, Gaighata, Duttapukur, Hatishala,
Ganganagar, Milk Colony, Anandapur, Nagerbazar, Birati, Nahata,
New Barrackpore, Rajchandrapur, Kona — 34 town/neighbourhood termini with
no equivalent row. Address and role blank (unverified). Remaining route
endpoints that are crossings, housing gates or small village termini
(Exide, Taratala, Boalghata, Fishery Gate, Kharibari, Boyra, Duttaphulia…)
were **not** created as stands; they exist as terminals on their route
sheets only, pending the office's decision.

Totals now: **466 routes** (310 private-operator, 156 Govt/WBTC),
**193 stands**.

## G. Buses on a route — what is genuinely missing, and why it stays blank

Re-audit of every route sheet (fleet text vs runs vs registrations):

| Finding | Count |
|---|---|
| Routes with a documented fleet count in the Master Index | 87 (all Govt, first batch) |
| Govt routes where **distinct registrations on the sheet are fewer than the documented fleet** | **47 — every one** (e.g. S5: 16 documented, 4 registrations; AC39: 6 documented, 1; S21: 8, 1) |
| Private routes (first batch) with 12 runs each but **no bus registration on any run** | 40 — the sheets themselves note "Private Operator Roster — Registration Left Blank" |
| Routes with no runs at all (incl. all 306 routes added in passes 1–2) | 379 |

**No bus, time or fleet data was added in this pass, deliberately.** No
published source (official or enthusiast) lists per-route registration
numbers or fleet counts for these routes, and a registration number is a
specific vehicle's identity — inventing `WB …` numbers would be fabricated
data, exactly what must not go to the transport office or the website.
The same applies to first/last times for the 379 blank routes. These can
only come from WBTC depot rosters and RTA/private syndicate rosters.

One caution for the office: the 40 first-batch private sheets all show an
identical pattern of 12 runs at regular intervals with blank registrations.
That pattern looks templated rather than rostered — please verify those
times too before publication. They were **not** altered in this pass.

## H. Number conflicts found in this pass — NOT changed, NOT duplicated

Already in the workbook under a number whose published corridor differs:
`1, 12C, 12C_1, 34C, 47_1, 212, 215, 218, 222, 230, 235, 240, SD4, SD8,
KB16, KB22` (plus §C). Published duplicate numbers where only the first
corridor was added or already existed — second corridor **not** added:
72 (Basirhat–Nazat), 73 (Habra–Naihati), 75 (Raipur–Babughat),
78 (Bagnan–Joypur), 96C (Bongaon–Beri Gopalpur), 211 (Patharghata /
Shikharpur boards), 239 (Shapoorji board), S151, S166, S184, M10 (two
different routes). Not added for uncertainty in the published text itself:
DN12_1 (origin printed "Hazra", corridor suggests Hasnabad), DN21,
SD24 (destination cut off in the source), the unnumbered "STA" services,
and 12/77A shuttle variants of numbers already added.

## Sources

- Transport Department, Govt. of West Bengal — Bus Depots & Terminals
  (official terminal lists by district):
  https://transport.wb.gov.in/infrastructure/bus-depots-terminals/
  (mirror: https://wbtidcl.com/services/bus-depots-terminals/)
- Kolkata Bus-o-pedia — Government bus routes (WBTC CSTC/CTC/WBSTC lists with
  via-stops): https://www.kolbusopedia.com/bus-routes-government
- Kolkata Bus-o-pedia — Private bus routes:
  https://www.kolbusopedia.com/bus-routes
- Kolkata Bus Routes (CSTC under WBTC) — AC/S/E route lists, used to
  cross-check the AC and S additions:
  http://kbscstc.blogspot.com/2018/04/kolkata-bus-routes-cstc-under-wbtc.html

---

# Publication gate — 15 October 2026 (review fixes applied to the code and the workbooks)

The three findings from the site review are fixed:

1. **Invented bus times are gone.** `estimatedTrips` (25-minute departures 06:00–21:00, fixed
   45-minute journey, identical in both directions) has been deleted from
   `fontend/src/lib/timetables.ts`, together with the illustrative sample frequencies that fed the
   same code path. `data/timetable_preview_routes.json`, which held those first/last/every values,
   was reduced to corridors and renamed `data/preview_route_corridors.json`. The site now shows a
   published run or nothing: a route that serves both stops but has no times says
   *"This route connects your stops. No timetable yet."* and lists the route without any times.
   The old "Estimated" and "Sample" labels are gone from `TripCard.tsx`, `BusDetailModal.tsx` and
   `RouteExplorer.tsx` because no trip can carry those labels any more.
2. **Unverified data is no longer live.** The Master Index now has `Verified`,
   `Timetable Source` and `May Publish` columns, which `static_export.py` carries into
   `kolkata-bus-data.json` as `verified` / `timetableSource`. Unverified routes keep their corridor
   (so they can still be looked up) but are exported with **no trips**, are tagged
   *Timetable pending* in the route list, and are filtered out of journey search in both the static
   site and `GET /api/v1/journeys/search`. The stands workbook got the same pair of columns;
   a stand with no published address or role is marked `Verified = no` with the reason in
   `Verification Note` and is exported with `"verified": false`.
3. **Where the remaining timetables come from.** `data/TIMETABLE_COLLECTION_PLAN.md` sets out what to
   collect (first bus, last bus, frequency, fleet, registrations, source, permission to publish),
   where each field is edited, and the order to collect them in — starting with the 40 templated
   private sheets and then the 40 busiest corridors with no times at all.

## What is published now

| | Routes | Notes |
|---|---|---|
| `Verified = yes` — published with times | **47** | sheets that record real runs *and* the vehicles working them |
| `Verified = no` — times look templated | 40 | identical 12-run pattern, no registration on any run (§G) — needs the operator's confirmation |
| `Verified = no` — no times recorded | 379 | first-pass and second-pass candidates awaiting the office |
| Preview corridors, no times, unverified | 2 | numbers `5`, `S6A`, which the directory does not contain at all |
| **Total** | **468** | 87 sheets still carry runs; 47 of them are published |

The stricter line (47, not 87) is deliberate: the audit's own §G warned that the 40 private sheets
look templated rather than rostered, so they stay unpublished until someone confirms them. Flip
their `Verified` cell to `yes` and re-run the exporter to publish them.

Test coverage added with this change (`backend/tests/`):

- `test_no_route_publishes_times_it_cannot_confirm` — an unverified route never carries trips, a
  verified one always records its source, and no route carries a `frequency`/estimated block.
- `test_published_routes_name_the_vehicles_that_work_them` — a published route names a bus on at
  least one run (individual floating-reserve runs may still have none).
- `test_master_index_publishes_only_what_the_workbook_marks_verified` and the stand equivalent.
- `test_journey_search_never_offers_an_unverified_route` — S12's own terminal pair returns only
  verified routes; route 45B's corridor returns nothing at all.

## Still open for the office (unchanged by this pass)

- Tables B (same stand under two names) and C (route numbers whose published corridor differs)
  from the first pass, plus §H number conflicts.
- The blank address and role fields on the unverified stands (111 rows), and coordinates, which the
  stands sheet still has no columns for.
- The 47 published routes still show times only at their two terminals; intermediate-stop times are
  not published anywhere, so intermediate journeys deliberately say *no timetable yet*.
