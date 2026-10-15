# Feature sweep — 15 October 2026

Full pass over every existing feature of the site, run after the review fixes in
commit `360ba78` ("Stop publishing invented times and unconfirmed routes"). Purpose:
confirm nothing broke while the invented times were removed, the publication gate was
added, and the timetables were re-exported.

**Result: 274 checks, 0 failures. Two real bugs found and fixed (`7c24f27`).**

## How each layer was tested

| Layer | Harness | Checks | Result |
| --- | --- | --- | --- |
| Timetable/data logic | Node, all 30 exports of `timetables.ts` against the real JSON | 78 | pass |
| Components + landing page | Server-rendered via `react-dom/server` | 55 | pass |
| Forced application states | Monkey-patched compiled output | 32 | pass |
| Browser behaviour | jsdom + React `act`, booting the real `app/page.js` | 30 | pass |
| API against PostgreSQL | `pytest` with a real bundled Postgres | 46 | pass |
| Live HTTP API | `uvicorn` + `urllib` against the real database | 33 | pass |

Static gates re-run clean afterwards: `tsc --noEmit`, `eslint .`, `npm run build`.
`manage.py export-static-data` was re-run and its output is byte-identical to the
committed JSON, so the export is deterministic.

## Bug 1 — stands with no address broke the importer (fixed)

`bus_stands.address` was declared `NOT NULL`, but 94 of the 193 directory stands have
no address on record. `manage.py import-data` / `init-db` aborted with a
`NotNullViolation` (first offender: row 89, "Bakkhali Beach Stand"), and because the
API test fixtures import the same data, all 26 database-backed API tests failed too.
This is why they had been skipped.

No address is *unknown*, not withheld, so the column is now nullable in
`backend/app/models.py`, `backend/app/schemas.py` (`address: str | None`) and
`backend/database/schema.sql`. After the fix: 46 tests pass, 0 skipped, and a full
`import-data` run loads 193 stands / 9 operators / 10 categories / 428 stops /
466 routes / 2723 route stops / 110 buses / 1048 trips / 2096 schedules.

These 94 stands are *not* counted as verified — only 82 of 193 stands carry a
published address and are marked verified.

## Bug 2 — two API tests had drifted from the data (fixed)

- `test_lookup_lists` hard-coded 8 operators and 10 categories; the directory has 9
  operators.
- `test_routes_list` expected all 466 route numbers inside a single page, but the
  endpoint caps `limit` at 200.

Both were wrong tests, not wrong code. They now read the expected values from the
exported data, and a new `test_route_list_pages_without_gaps_or_repeats` walks the
pages (200 + 200 + 66) to prove all 466 route sheets are served exactly once with no
duplicates.

## What the sweep confirmed works

**Publication gate.** 47 routes are published and 421 are withheld — the static JSON
shows `468 routes · 47 with times · 387 stops` on the landing page, and the API agrees
(`verified=true` → 47, `verified=false` → 419 in the 466-row directory; the static JSON
is 2 rows larger because it carries the 2 preview corridors). Unverified routes never
appear in journey results: the check scans **every** unverified route number in the
whole journey payload and finds none. Route 45B (pending) serves zero trips, and its
voyage search result carries no times at all.

**No invented times anywhere.** Route `45B` shows "Timetable pending" with no table and
no leaked run codes. A route with no timetable says "This route connects your stops. No
timetable yet." Verified routes show real data only — run codes like `RUN-S12-01`,
registration `WB 05 6214`, "Source: Routes workbook sheet Route_S12".

**Journey search.** Stops → results → detail modal works; transfer planning works where
a change genuinely exists (`Garia 6 No. Stand → Salt Lake Sector V` = 1 plan, AC5 + C11
changing at Howrah Railway Station). Zero-transfer pairs correctly stay empty. Late-night
searches degrade gracefully ("That's the last bus after this time").

**Browser features.** Theme toggle applies to `<html>`, persists to `localStorage` under
`cholo-theme`, and defaults to light. Share links `?from=&to=&time=` prefill the form and
preselect the upcoming tab; `?route=NNN` opens the route directly, including for pending
routes; an invalid time in a link does not break the page. Recent-buses history persists
to `localStorage`, the modal closes on Escape, back-to-top appears on scroll, share copies
the link and confirms, and a blocked clipboard shows "Copy failed" instead of crashing.
Submitting the same stop twice is rejected with a message.

**API surface.** `/health` reports database `ok`; 9 operators, 10 service categories,
428 stops, 193 stands, 110 buses, 466 routes all paginate correctly; single-stand and
single-bus lookups work; operator/category/text filters work; unknown routes, stands and
buses 404; `limit` above 200 is rejected with 422.

## Note for the next pass

The 94 stands without an address and the 421 routes without a published timetable are
expected, documented gaps — not defects. They are tracked in
`MISSING_DATA_AUDIT.md` and `TIMETABLE_COLLECTION_PLAN.md`, and the site states the
shortfall openly rather than filling it with invented numbers.
