# 12. NABARD unit costs and schemes for more states

**Status:** done (2026-11-06). NABARD poultry unit costs for all 28 states (165 rows, 2025-26 or 2026-27, each total checked against its booklet page; Andhra Pradesh and Telangana as per-bird norms because their booklets print no unit totals). State schemes from official orders for Maharashtra (capital subsidy and 4% interest subvention), Bihar, Odisha, Uttarakhand, Uttar Pradesh and Assam, plus unverified ones from department pages, handbills or press releases for Goa, Himachal Pradesh, Jharkhand, Tamil Nadu and Arunachal Pradesh. No in-force state poultry farm scheme was found for the other 16 states. Each scheme has a test in `src/test/poultry-data.test.ts`.

## What is still open (not blocking)

- Cage-layer units fall back to Jharkhand's in Himachal Pradesh, Kerala, Rajasthan, Sikkim, Uttar Pradesh and Uttarakhand: their
  booklets have no cage-layer unit.
- Gujarat's poultry schemes (1,000-broiler, 100-broiler and RIR/Kadaknath units) exist, but their terms load only in a browser on
  the Animal Husbandry Directorate's site; read them there and add them. Meghalaya's CM-ELEVATE and Andhra Pradesh's Poultry
  Development Policy 2026-29 need their official orders. Karnataka's Pashu Bhagya has no guideline newer than 2019-20.
- The unverified schemes (Goa, Himachal Pradesh, Jharkhand, Tamil Nadu, Arunachal Pradesh) need their order numbers.
- Left out on purpose: Uttarakhand's CM State Livestock Mission (enrolment window likely closed) and Poultry Valley
  (cooperative members only), Assam's 2024-25 SCOPE and egg programmes, West Bengal's layer incentive (ended Aug 2025).

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
