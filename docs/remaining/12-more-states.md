# 12. NABARD unit costs and schemes for more states

**Status:** Maharashtra done (2026-11-05). Unit costs (NABARD 2025-26) are transcribed and used by `nabardComparison`. The scheme is read from the official GR on gr.maharashtra.gov.in: DAHD-14017/1/2026-AH4 of 9 March 2026, State Plan Scheme (unique code 202603091924368401), with its corrigendum of 27 August 2026 (202608271649419545), which changes nothing for poultry. Both are in the knowledge manifest. NABARD poultry unit costs for all 28 states added 2026-11-05 (161 rows in `datasets/csv/nabard_poultry_unit_costs.csv`, 2025-26 or 2026-27, each total checked against its booklet page). Still open: commercial broiler and layer totals for Andhra Pradesh and Telangana (their booklets print only per-bird and per-sq-ft norms), cage-layer units for Himachal Pradesh, Kerala, Rajasthan, Sikkim, Uttar Pradesh and Uttarakhand (they fall back to Jharkhand's), and state schemes other than Maharashtra's.

## Why it is open

- **Unit costs:** NABARD publishes unit costs per state (each regional office). Only Jharkhand (2023-24), Maharashtra
  (2025-26) and Tamil Nadu (2026-27) are transcribed (`datasets/csv/nabard_poultry_unit_costs.csv`); a project in any other state is compared with
  Jharkhand's figures. Banks finance against their own state's.
- **State schemes:** only Maharashtra's scheme is in the planner.

Where unit costs are: NABARD's state-wise unit cost page, https://www.nabard.org/info-centre-statewise-masterunitcost.aspx?cid=669&id=24,
lists every state's booklet for 2025-26 and 2026-27. It blocks scripted requests, so pick the state and year in a browser; the
PDF links it gives download normally. Several booklets are scans with no text layer, so their figures have to be read from the page.

Finding a Maharashtra GR: on gr.maharashtra.gov.in pick the department, put the date as YYYYMMDD in Unique Code (it accepts
part of a code), and use the old department name for orders before 24 June 2026. A GR's PDF is at
`https://gr.maharashtra.gov.in/Site/Upload/Government%20Resolutions/Marathi/<unique code>.pdf`.

## What to do

1. Start with the states where most users are (Maharashtra first, as decided in `docs/migration/README.md`).
2. Unit costs: find the regional office's unit cost document, transcribe the poultry rows into the CSV with
   `source_document` and `source_url`, and teach `nabardComparison` in `backend/services/poultry/costModel.js` to use
   the project's own state when it has rows (and Jharkhand otherwise, saying so).
3. Schemes: find the official order, add the rules to `datasets/csv/poultry_scheme_rules.csv` and
   `backend/data/poultry/schemes.js` with `verified: true`, and a test for its eligibility.
4. Add the new documents to `datasets/knowledge/manifest.json` so the assistant can cite them.

## Done when

The NABARD card on the Cost step shows the project's own state where data exists, and each added scheme has an
official source and a test.
