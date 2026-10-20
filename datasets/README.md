# Datasets

Every number here was downloaded from, or transcribed line by line from, a public source. Nothing is
estimated, interpolated, or generated. Where a source could not be used, the gap is listed below
instead of being filled.

## What is in `csv/`

### `nhb_midh_protected_cultivation_cost_norms.csv` (19 rows)
Government cost norms for protected cultivation, in INR per sq m (hilly-area rate in its own column).
Transcribed from the table in the **Cost Norms and Pattern of Assistance** document (MIDH, Appendix-1),
<https://nhb.gov.in/hindi/pdf/Cost%20Norms.pdf>. The last three rows come from NHB's older norms
document (applicable from 01.04.2008), <https://www.nhb.gov.in/documents/cost-norms.pdf>, and are
marked "NHB (older norms)". The document does not carry a publication date, so treat the rates as the
current published norms, not as a quote. States may apply their own rates (West Bengal and the
Andaman & Nicobar Islands publish different ones).

These are the **National Horticulture Board** rates (table row A.2, projects above 2500 sq m, now 4000 sq m and above per the 2025-08-12 letter below). Smaller projects go through the state horticulture mission (NHM/HMNEH), whose norms vary by area slab and are not in this dataset (the HMNEH 2018-19 document lists Rs 935/sq m for 500-1008 sq m). The `Project cost norm` row carries the per-project limit: Rs 112.00 lakh project cost, assistance 50% limited to Rs 56.00 lakh.

Use for: sanity-checking the cost model (`node backend/scripts/auditCalculations.js`) and indicative subsidy estimates.

### `midh_protected_cultivation_area_limits.csv` (4 rows)
Per-beneficiary protected-cultivation area limits, from Ministry of Agriculture & Farmers Welfare
letter File No. M-1401 1/5/2024-MIDH,
<https://shm.tg.nic.in/Download/Modification%20in%20the%20MIDH%20guidelines-Protected%20Cultivation.pdf>.
Current limit 4000 sq m from 2025-08-12; the superseded 2500 sq m limits are kept with their dates.

### `district_climate_monthly.csv` (7,020 rows = 540 districts x 13)
Monthly climatology (JAN-DEC plus `ANN`, the annual value) per district from **NASA POWER**, community
`AG`, <https://power.larc.nasa.gov>. NASA's response describes it as a 25-year monthly and annual
climatology, January 2001 to December 2025 (API v2.10.1). Units, as reported by the API:
`t2m_*_c` degrees C, `rh2m_pct` %, `precip_mm_per_day` mm/day, `solar_mj_m2_per_day` MJ/m^2/day,
`wind_2m_m_per_s` m/s.

**Caveat on coordinates.** NASA POWER is queried by latitude/longitude, and there is no
machine-readable official list of district coordinates. Coordinates therefore come from **GeoNames
through the Open-Meteo geocoding API**, which is a public geographic database but *not* a government
source. A match is only accepted when the geocoder's state equals the app's state, which resolves
name collisions (for example Aurangabad in Maharashtra vs Bihar). The climate value is for that
point, not a district average, and mountainous districts can differ a lot within their boundary.
The geocoder's matched name and GeoNames id are in the file so any match can be audited.

Use for: crop-suitability scoring and per-district climate (replacing the per-state table in
`backend/data/stateClimate.js`).

**Caveat on `t2m_max_c` and `t2m_min_c`.** NASA defines these as the highest and lowest *hourly* reading in the period, so they are extremes, not typical days (Shimla reads 43.9 C in its hottest month). Use `t2m_mean_c` for typical conditions. `node datasets/scripts/build_climate_profiles.mjs` turns this file into `backend/data/climateProfiles.json`, the hottest-month mean per district and the state means the calculator uses.

### `crop_yields_published.csv` (9 rows)
Yields transcribed from three published papers (two in the Indian Journal of Horticulture, one in Indian Farming). Rows marked `measured` (tomato, capsicum, cucumber, gerbera) are what the app shows; `potential` rows (reported best-case yields) and one misprint are kept for the record with `used_by_app = no`. Trials were run in mid-hill Meghalaya (vegetables) and Junagadh, Gujarat (gerbera), in naturally ventilated polyhouses, so other regions will differ.

### `district_climate_unresolved.csv` (177 rows)
Districts in `shared/india-locations.json` the geocoder could not place in the right state (many
Arunachal Pradesh, Telangana, Gujarat, West Bengal, Meghalaya and Assam districts, mostly newer
or renamed districts). They are deliberately left out rather than guessed. Fall back to the state
value for these.

### Poultry planner datasets (Phase 2 of `docs/migration`)

Loaded into the `poultry_*` tables by `node backend/scripts/loadReferenceData.js poultry`. The figures also live in code, and `src/test/poultry-data.test.ts` keeps the two equal.

| File | Rows | What it holds | Source |
|---|---|---|---|
| `nabard_poultry_unit_costs.csv` | 6 | Unit cost of 250 to 5,000-bird broiler and cage layer units, with the cost breakdown | NABARD Unit Cost 2023-24, Jharkhand RO |
| `poultry_production_norms.csv` | 7 | Floor space, rearing and cleaning days, mortality, weight, feed and eggs for each bird and shed | NABARD broiler, layer and indigenous model projects; NCDC broiler DPR (2020); ICAR housing norms |
| `poultry_scheme_rules.csv` | 3 | NLM-EDP rural poultry, AHIDF, Maharashtra's state scheme (unverified) | NLM-EDP guideline (2024), AHIDF guidelines, secondary summaries |
| `poultry_siting_rules.csv` | 9 | CPCB distances, pollution consent, NABARD 1 km rule, registration | CPCB guidelines and NGT orders, NABARD, DAHD 2025 |

## `knowledge/`: what the AI assistant reads

`knowledge/manifest.json` lists every official document the assistant searches, with its publisher, URL, status (current or older) and any known gaps: the MIDH Operational Guidelines 2025, NHB cost norms and guidelines, the NCERT protected-cultivation textbook, TNAU crop guides and IPM schedule, Vikaspedia (capsicum) and AAU (strawberry). `python datasets/scripts/fetch_knowledge.py` downloads them into `knowledge/raw/` and extracts the text into `knowledge/text/` (it needs poppler's `pdftotext`, or `pip install pypdf`). Both folders are git-ignored because some documents are copyrighted. The backend also turns the CSVs above and its own cost model into passages, so the assistant can cite them.

## `eval/`: checking the assistant

`eval/assistant-questions.json` holds 91 questions with answers checked against the files above: costs and subsidy (both the NHB and the MIDH 2025 figures are accepted where both are current), crops and pests, the project's own numbers, "what if" questions answered by the planner, Hindi and Marathi, edge cases (off-topic, prompt injection, false premises, typos, follow-ups) and request validation. Each case has regular expressions the answer must and must not match, and a `source` saying where the answer comes from. Run it with `cd backend && npm run eval:assistant` (real models; well over an hour on a laptop CPU, or `-- --only=id1,id2`).

## Crop planning defaults

The returns panel's default yields and prices (`src/lib/finance.ts`, `CROP_ECONOMICS`) each name their source, which the app shows: tomato from TNAU (hybrids 80-95 t/ha), capsicum from Vikaspedia (80-100 t/ha per 7-10 month crop), cucumber from ICAR Indian Farming 2025 (40-50 t/ha per 3-3.5 month crop), strawberry from AAU (200-250 q/ha), gerbera from the Junagadh trial in `crop_yields_published.csv`; tomato, capsicum and cucumber prices from the Agmarknet national median of 13 Oct 2026. The lettuce yield and the lettuce, strawberry and gerbera prices have no official source yet and are labelled as assumptions.

## Not included, and why

| Needed by | Data | Status |
|---|---|---|
| Price forecasting | Price history (Agmarknet) | Today's mandi prices are fetched into the `mandi_prices_daily` table by `backend/scripts/ingestMandiPrices.js` (needs a free `DATA_GOV_IN_API_KEY`, verified against the live API on 2026-10-13; Tomato, Capsicum and Cucumber are published, Lettuce, Strawberry and Gerbera are not). The source publishes only the current day, so history exists only from the day the daily job (`.github/workflows/mandi-prices.yml`) started running. Forecasting needs months of that history. |
| Crop-suitability scoring | Crop temperature/humidity requirements, and yields for crops other than tomato, capsicum, cucumber and gerbera | Published figures live inside research papers, so this is manual curation. Yields for four crops are done (`crop_yields_published.csv`); the rest are not. |
| Crop-suitability scoring | State-wise crop area/production (NHB statistics PDFs) | The PDFs at <https://www.nhb.gov.in/statistics/State_Level/> extract with misaligned columns (values clearly wrong), so they are not safe to ingest automatically. Needs the Excel/CSV version from NHB or data.gov.in. |
| Cost model | Real project quotations | No public dataset exists. Collect from users or suppliers. |
| Soil suitability | Soil pH / organic carbon by location | SoilGrids' REST API was reported paused; the India SIS service was not evaluated. |

## Regenerating

```sh
node datasets/scripts/build_district_climate.mjs          # about 10 minutes the first time; cached after
node backend/scripts/ingestMandiPrices.js              # needs DATA_GOV_IN_API_KEY in backend/.env; also runs daily via GitHub Actions
node backend/scripts/loadReferenceData.js               # (re)load the four CSVs above into Postgres
```

`datasets/.cache/` holds the raw API responses and can be deleted safely.

## IMD district rainfall normals (not imported yet)

`data.gov.in` publishes "District Rainfall Normal (mm), monthly, seasonal and annual data, period 1951-2000" from the India Meteorological Department. It has no API: open the dataset page in a browser, download the CSV and save it here as `datasets/csv/imd_district_rainfall_normals.csv` (columns STATE/UT, DISTRICT, monthly values, ANNUAL). Then run `node backend/scripts/buildRainfallProfiles.js`. It writes `backend/data/rainfallProfiles.json` (used by the cost model) and lists districts it could not match in `datasets/csv/imd_rainfall_unmatched.csv`.
