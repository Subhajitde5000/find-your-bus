# Direction-bug audit — v2 dataset, 17 October 2026

This is the measurement behind the fix in `fontend/src/lib/timetables.ts` and
`fontend/src/lib/timetables.test.ts`. It covers the reported
**Howrah Railway Station ↔ Salt Lake Sector V** journey and every other ordered stop pair in the
bundled v2 dataset.

> **Repository note.** `fix-invented-times.patch` in the repo root is already applied at `HEAD`
> (the patched `timetables.ts` blob is `6caa6b7`), so `git apply --check` fails with "patch does
> not apply". Do not re-apply it. The source tree and the test file are authoritative; the patch
> file is only a historical record.

## 1. What the original bug was

The old `estimatedTrips` function never looked at the route, the stops or the direction. For every
search that was not terminal-to-terminal it generated a fixed wave:

```
06:00, 06:25, 06:50 … 21:00   (37 departures)
each trip: departure = start, arrival = start + 45
```

The route number and the stop names changed; the times did not. It ran on every middle-stop search,
including the 373 old directory routes that published **no** timetable at all. Swapping the stops
therefore returned the same buses at the same times.

The first fix removed that wave and, because the old workbook only published terminal times,
interpolated middle-stop times from the real terminal times in the correct direction. That was the
best available answer for the old workbook, but it was still an estimate, marked `~`.

## 2. What the site does now

The site has moved to `Kolkata_Comprehensive_Bus_Routes_and_Fleet_Directory-v2.xlsx`, which publishes
a passage time at **every stop column**. The data layer therefore no longer interpolates:

- Each workbook row is stored as one **directional run** with one time per stop. Outbound and
  return rows are not paired into a synthetic round trip.
- A search between any two stops on a route uses the boarding and alighting cells that the workbook
  prints for that run and that direction.
- Every stop on the trip shows its published passage time. A blank cell would stay `null`; no time
  is invented.
- Sample routes are still illustrative and are still labelled `Sample`. Their return is modelled
  as the same sample bus coming back after its outbound travel time plus the sample turnaround.
- There is no `approximate` trip kind, no `~` marker and no approximate-time field any more.
  Every published trip is exact (`scheduled`) or a labelled `sample`.

The old 460-route directory is no longer read by the site. The decision, the route-count trade-off
and the C11 conflict are recorded in [`DATA_SOURCE_CONFLICT.md`](DATA_SOURCE_CONFLICT.md).

## 3. The reported journey, measured on v2

v2 has **no timetable column for Salt Lake Sector V** on any route. S12's alignment sentence names
Sector-V, but its timetable columns go `Karunamoyee → Eco Park → New Town`; 46 of the 75 sheets have
the same kind of difference between their alignment sentence and their timetable. The build script
uses the timetable columns, so no v2 route serves Sector V in the bundled data.

The only retained route that serves both Howrah Railway Station and Salt Lake Sector V is the
sample **S12E**:

| Search | Result |
|---|---|
| Howrah Railway Station → Salt Lake Sector V | **23 trips, all S12E, all `Sample`** |
| Salt Lake Sector V → Howrah Railway Station | **23 trips, all S12E, all `Sample`** |
| First forward (Howrah → Sector V) | `08:00 → 09:08` |
| First reverse (Sector V → Howrah) | `06:32 → 07:40` |

The two directions now have different times. They are not presented as a published timetable:
every card is labelled `Sample`.

For comparison, the v2 C11 is a different route (`Howrah ↔ Tollygunge`, 7 runs each way; first
outbound `06:15 → 07:10`, first return `07:30 → 08:25`). It does not appear in the Sector V search.

### Other searches checked

| Search | Timed trips | Routes |
|---|---:|---|
| Howrah → Karunamoyee | 24 | S12 (8), VS2 (8), AC12 (8) |
| Karunamoyee → Howrah | 24 | S12 (8), AC12 (8), VS2 (8) |
| Howrah → Tollygunge | 54 | C11 (7), S2 (8), AC5 (8), S6A (31 sample) |
| Tollygunge → Howrah | 54 | S2 (8), AC5 (8), S6A (31 sample), C11 (7) |
| Howrah → R.G. Kar Hospital | 5 | NS2 (5) |
| R.G. Kar Hospital → Howrah | 5 | NS2 (5) |

## 4. Every route, every stop pair

Dataset at the time of this measurement: **83 routes** (75 v2 directory + 8 sample), **152 stops**,
**1,056 directional runs**. The 566 catalogue routes and one externally timed service added later
carry no invented times and are audited separately in `ROUTE_EXPANSION_AUDIT.md`; the direction
checks below still cover the 1,770 timed pairs.

| Check | Result |
|---|---|
| Ordered stop pairs across all routes | **1,770** |
| Pairs with timed trips in both directions | **1,770** |
| Directory stop pairs | 1,539 |
| Sample stop pairs | 231 |
| Directory trip instances generated across all pairs | 21,696 |
| Sample trip instances generated across all pairs | 13,546 |
| **Pairs showing identical times both ways** | **0** |
| Results boarding or alighting the wrong way round | 0 |
| Duplicate trip ids in a search result | 0 |
| Trips whose boarding/alighting time differs from the published cell | 0 |
| Trips whose every stop time differs from the published cell | 0 |
| Route stops missing from the stop directory | 0 |
| Routes whose first/last stop is not the route origin/destination | 0 |
| Routes that are both a timed trip and a no-timetable link | 0 |
| Duplicate route numbers / run codes / stop names | 0 |

The old dataset's measurement is kept for history: 7,803 pairs, 1,547 timed both ways, 7,485
searches that had used the fixed 06:00 wave, and 3 sample pairs that copied times both ways before
the sample-return model was fixed. Those numbers no longer describe the bundled site.

## 5. v2 source quirks handled by the build script

### The `Operational Notes` column is not a stop

Every timetable section ends with an `Operational Notes` column. A naive `header[2:]` treats it as
a stop and shifts the last time into the wrong place. The reader stops at the cell whose text
starts with `Operational Notes`, so the stop list and the time slice always line up.

### Midnight crossings

11 runs have a published time that is earlier than the previous stop's time because the bus crosses
midnight:

`RUN-NS1-RET-01`, `RUN-NS2-OUT-02`, `RUN-NS2-RET-01`, `RUN-NS3-OUT-02`, `RUN-NS3-RET-01`,
`RUN-NS4-OUT-02`, `RUN-NS4-RET-01`, and the four `RUN-Siliguri_Express-OUT-0x` runs.

They are **not** treated as unordered. The frontend unwraps each run onto a service timeline
(`23:15 → 00:05` becomes `1395 → 1445`) and also keeps overnight runs in order across the run list
(`22:15, 23:15, 00:15, 01:15, 02:15` becomes `1335, 1395, 1455, 1515, 1575`). NS2's five outbound
trips therefore sort in the order the workbook publishes them, with positive durations.

### Blank cells

v2 currently has **0 blank time cells**. The reader still stores a blank as `null`, and the UI
prints "No time published" for it. If a run is blank at the searched boarding or alighting stop,
that run is skipped for that search rather than given an estimate.

### Alignment sentences

46 of 75 sheets have a distance-alignment sentence that does not match their timetable columns.
The build script reports the mismatch and uses the timetable columns. No stop is added from the
sentence and no time is inferred for it.

### Stop-name merges

Eleven spelling groups are merged, all certainly the same place:

`Howrah Stn`/`Howrah Station` → `Howrah Railway Station`; `Sealdah Stn` → `Sealdah`;
`BBD Bag` → `B.B.D. Bagh`; `Bagbazar` → `Baghbazar`; `Garia Stn` → `Garia Station`;
`Maulali` → `Moulali`; `Parnashree` → `Parnasree`; `Ultadanga / HUDCO` → `Ultadanga`;
`New Town Bus Stand` → `New Town`; `Ruby Hospital` → `Ruby`; `Hazra More` → `Hazra`.

Every other v2 header name is kept exactly as published. No stop was invented.

## 6. Why sample routes needed their own fix

The first patch removed `estimatedTrips` but kept the preview routes with illustrative frequencies.
Their return schedule was a second, independent wave starting at `first + reverseOffset`. For three
stop pairs that wave landed on exactly the same minutes as the outbound wave, so the original
symptom survived in a smaller form:

```
5    Gariahat ↔ Park Street          05:59→06:25, 06:24→06:50, … both ways
S6A  Tollygunge ↔ Esplanade          06:20→06:59, 06:50→07:29, … both ways
AC9B Chingrighata ↔ Sector V         07:18→07:32, 08:03→08:17, … both ways
```

The tests that shipped with the first patch skipped sample routes in the direction check, so they
passed. The fix now models the sample return as **the same bus coming back**: it leaves the far
terminal after its outbound travel time plus the sample turnaround. That is still illustrative (the
routes are labelled `Sample`), but it cannot copy the outbound times. The direction test now runs
over all 1,770 pairs including samples.

## 7. Tests that guard this

`cd fontend && npm test` — **31 tests, all passing**. The important ones:

- every route, every stop pair, both directions — no identical time list;
- every directory trip's boarding, alighting and every intermediate stop equals the exact
  published cell for that run and direction (this is what would fail if interpolation came back);
- terminal-to-terminal searches equal the published outbound/return run times;
- overnight runs keep their published order and positive duration (NS2);
- every timed trip can be traced to a published run or a sample frequency;
- route links are never also timed trips;
- every trip id is unique within a search;
- data integrity: unique route numbers/run codes/stops, terminals match first/last stop, no
  duplicate stop on a route, every stop exists, counts match, every run has one time per stop,
  times are valid 24-hour clock values;
- the bundled file's sources are the v2 workbook (not the old directory);
- malformed input (missing stop names from old localStorage) does not throw.

`npm run typecheck`, `npm run lint` and `npm run build` are also green.

## 8. Remaining risks and open decisions

1. **Coverage.** v2 has 75 routes; the old bundled directory had 460. The 397 old-only routes are
   no longer listed. This is the accepted cost of switching to complete v2 timetables.
2. **Salt Lake Sector V.** No v2 route publishes a time there. The only coverage is the sample
   S12E, so the reported journey is now a `Sample` result rather than a scheduled one. Adding
   Sector-V back would require a timetable column in the v2 workbook; it was not invented.
3. **Route identities vs published lists.** The workbook remains the project source. Published
   lists conflict with it for some codes (C11 is the example); no correction pass was run, by
   decision.
4. **Sample routes are still illustrative.** They are direction-safe and labelled `Sample`, but
   their frequencies are not published timetables.
5. **Stop-name merges are deliberately limited.** Only 11 groups are merged. Some near-duplicate
   v2 names remain separate (`Airport`, `Airport 1 No.`, `Airport Gate 1`; `Sinthi` and
   `Sinthi More`; `Ruby / GST Bhawan` and `Ruby / Chittaranjan Cancer Inst`) because merging them
   would be a guess. They will not connect in transfer search until the workbook or a source
   confirms the identity.
6. **Overnight "after your time" filtering.** The page filters trips by a 24-hour clock value.
   Overnight runs are placed on the service timeline so they sort correctly, but a search at 08:00
   can also list a 00:15 departure as the next service-day run. No live service-date logic exists.
7. **No live data.** Nothing on the site is live tracking.
