# 12. NABARD unit costs and schemes for more states

**Status:** partly done (2026-11-05). Maharashtra unit costs (NABARD 2025-26) are transcribed, checked against the source PDF and used by `nabardComparison`. Maharashtra's scheme is now read from the GR itself (DAHD-14017/1/2026-AH4, 9 March 2026) and marked verified. Still open: the original GR link on gr.maharashtra.gov.in (only a Google Drive copy was found), adding the GR to the knowledge manifest once that link exists, and every other state.

## Why it is open

- **Unit costs:** NABARD publishes unit costs per state (each regional office). Only Jharkhand's 2023-24 poultry unit
  costs are transcribed (`datasets/csv/nabard_poultry_unit_costs.csv`), so every farm is compared with Jharkhand's
  figures. Banks finance against their own state's.
- **State schemes:** only Maharashtra's scheme is in the planner, and it is marked unverified: no official Government
  Resolution was found, only third-party summaries.

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
