# Timetable sourcing audit — 17 October 2026

**Question:** the Excel workbooks carry run times for 87 of the 460 directory routes.
Can real departure times be sourced for the other 373 — and can real times be sourced for
the intermediate stops of the routes that do have times?

**Answer: no. Nothing was added.** Published departure times do not exist for Kolkata city
and suburban buses. Every source below was checked, and the only one that appears to offer
them disclaims them as estimated. Where a time cannot be sourced the site keeps showing
"No time published" / "no published timetable yet", which is the correct behaviour.

Scope: data files only. No Excel cell was edited and no website times were changed as part
of this pass.

---

## 1. `citybustimetable.com` — checked and REJECTED

Ranking highly for "Kolkata bus time table", this site publishes a full per-route,
per-stop departure grid. Two examples:

- Route S-7, Howrah column: `6:00 AM, 6:30 AM, 7:00 AM … 9:00 PM` — every 30 minutes exactly,
  with every stop downstream offset by exactly 7 minutes.
- Route E-1, Jadavpur column: `5:30 AM, 6:45 AM, 8:00 AM … 9:45 PM` — every 75 minutes exactly,
  with every stop downstream offset by exactly 15 minutes.

A real timetable does not look like this. For comparison, C11 in this project's own workbook
departs at `06:00, 06:30, 07:15, 08:00, 08:45, 10:00, 12:00, 14:00, 16:30, 17:30, 18:30, 19:30`
— irregular, as an actual roster is.

The page states it itself:

> **Note:** Departure times are estimated, assumed per stop. Actual times may vary due to
> traffic, passenger load, or road conditions. […] For a complete table with all stops, use
> the provided pattern or check real-time schedules.

Rejected. Using it would mean putting invented times on the site, which is the bug this
project just finished removing.

## 2. BusJatri open data — checked, and it CONFIRMS the gap

[`murmusuvash2-wq/busjatri-open-data`](https://github.com/murmusuvash2-wq/busjatri-open-data)
(CC BY 4.0) — 4,728 services, 61,126 ordered stoppage rows, 2,740 stops, compiled from official
WBTC / SBSTC / NBSTC schedules and depot boards, with a per-row `source` column. This is the
most serious open dataset available, so it was downloaded and cross-referenced against this
project's 468 routes.

Its own caveat:

> **City and suburban buses in Kolkata run to frequency.** They have no published departure
> times, so `departure_time` is blank for them. Blank does **not** mean missing — it means no
> fixed time exists. Do not read a blank as "00:00".

Measured against this project's route list:

| Check | Result |
|---|---|
| `buses.csv` rows whose route number matches one of ours | **317**, across 152 route numbers |
| …of those, carrying a departure time | **0** |
| Services with per-stop `up_time` / `down_time` matching one of our routes | **0** |
| `routes.csv` rows matching one of our origin → destination pairs | 22 |
| …of those, carrying a first-departure time | **0** |

For contrast, the dataset does carry times for 2,697 services in total — but they are
long-distance work (NBSTC Kharagpur–Baharampur, SBSTC, WBTC Esplanade–Digha, Shyamoli
Paribahan and similar). The 136 WBTC rows that have times are all long-distance; none is a
Kolkata city route.

## 3. Official sources — routes and stops, no times

- **WBTC official intra-city route list** (`wbtconline.in/assets/pdf/INTRA_CITY_RTS_Latest-small.pdf`)
  — authoritative for route number, originating point, terminating point and the stoppage chain.
  It carries **no departure times at all**.
- **Transport Department, Government of West Bengal** (`transport.wb.gov.in`) — bus services and
  time-table pages. The SBSTC material there is intercity (`RouteTimeTableFareSBSTC.pdf`), not
  city service.

## 4. Independent projects agree

- [`rounak-adhikary-github/bus-bondhu`](https://github.com/rounak-adhikary-github/bus-bondhu) —
  "Route numbers and stop sequences are as published by WBTC and Kolkata Bus-O-Pedia.
  Frequencies, first/last times, route lengths and journey times are **not published by either**
  and are therefore estimates."
- [`aitareo71/kolkata-bus-tracker`](https://github.com/aitareo71/kolkata-bus-tracker) — "There is
  currently **no official public real-time API or open GTFS feed** for WBTC / private Kolkata
  buses (unlike, say, Bengaluru's BMTC). Google Maps shows live WBTC arrivals inside its own app,
  but does not expose that data for third-party use."

---

## Conclusion

Kolkata city and suburban buses run to frequency. No operator or government body publishes a
fixed departure timetable for them, no open GTFS feed exists, and the sites that display one are
generating it.

Therefore:

- **Intermediate stops stay "No time published."** There is no real time to put there. The `~`
  times already shown for the searched boarding and alighting stops are derived from that run's
  own published terminal times and are labelled approximate; nothing more can be sourced.
- **The 373 routes without run rows stay "no published timetable yet."** Adding times to them
  would mean inventing them, which is exactly the defect that was removed.
- **What could still be added honestly**, if wanted later: verified *stop sequences* — the BusJatri
  stoppage data and the WBTC official route list both cover these, and 313 of the 317 matched
  services carry a stoppage chain of a different length to this project's. That is real data with a
  source, but it is a separate exercise and would need a decision on which source wins wherever
  they disagree.

## Sources

- BusJatri open data (CC BY 4.0) — https://github.com/murmusuvash2-wq/busjatri-open-data
- WBTC official intra-city route list — https://wbtconline.in/assets/pdf/INTRA_CITY_RTS_Latest-small.pdf
- West Bengal Transport Department — https://transport.wb.gov.in/transport-services/bus-services/
- bus-bondhu — https://github.com/rounak-adhikary-github/bus-bondhu
- kolkata-bus-tracker — https://github.com/aitareo71/kolkata-bus-tracker
- citybustimetable.com — checked, rejected, see section 1
