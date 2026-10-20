# Datasets

Every number here was downloaded from, or transcribed line by line from, a public source. Nothing is estimated,
interpolated or generated. Where a source could not be used, the gap is listed below instead of being filled. The
polyhouse planner's datasets (NHB/MIDH cost norms, area limits, crop yields) are kept only on the `polyhouse` git tag.

## What is in `csv/`

### Poultry tables

Loaded into the `poultry_*` tables by `node backend/scripts/loadReferenceData.js poultry`. The same figures live in
code (`shared/poultry-norms.json`, `backend/data/poultry/`), and `src/test/poultry-data.test.ts` keeps the two equal.

| File | Rows | What it holds | Source |
|---|---|---|---|
| `nabard_poultry_unit_costs.csv` | 6 | Unit cost of 250 to 5,000-bird broiler and cage layer units, with the cost breakdown | NABARD Unit Cost 2023-24, Jharkhand Regional Office |
| `poultry_production_norms.csv` | 7 | Floor space, rearing and cleaning days, mortality, weight, feed, eggs and feed conversion for each bird and shed | NABARD broiler, layer and indigenous model projects; NCDC broiler DPR (2020); ICAR housing norms; IJAH 2025 broiler study |
| `poultry_scheme_rules.csv` | 3 | NLM-EDP rural poultry, AHIDF, Maharashtra's state scheme (unverified) | NLM-EDP guideline (2024), AHIDF guidelines, secondary summaries |
| `poultry_siting_rules.csv` | 9 | CPCB distances, pollution consent, NABARD 1 km rule, registration | CPCB guidelines and NGT orders, NABARD, DAHD 2025 |

NABARD publishes unit costs per state; only Jharkhand's are transcribed so far. `src/test/poultry-calculations.test.ts`
holds the planner to within 10% of each of these units (it reproduces them within 1.3%).

### `district_climate_monthly.csv` (7,020 rows = 540 districts x 13)

Monthly climatology (JAN-DEC plus `ANN`, the annual value) per district from **NASA POWER**, community `AG`,
<https://power.larc.nasa.gov>. NASA's response describes it as a 25-year monthly and annual climatology, January 2001
to December 2025 (API v2.10.1). Units, as reported by the API: `t2m_*_c` degrees C, `rh2m_pct` %,
`precip_mm_per_day` mm/day, `solar_mj_m2_per_day` MJ/m^2/day, `wind_2m_m_per_s` m/s.

**Caveat on coordinates.** NASA POWER is queried by latitude and longitude, and there is no machine-readable official
list of district coordinates. Coordinates therefore come from **GeoNames through the Open-Meteo geocoding API**, which
is a public geographic database but *not* a government source. A match is only accepted when the geocoder's state
equals the app's state, which resolves name collisions (for example Aurangabad in Maharashtra vs Bihar). The climate
value is for that point, not a district average, and mountainous districts can differ a lot within their boundary. The
geocoder's matched name and GeoNames id are in the file so any match can be audited.

Use for: the district climate card and **heat stress**. `node datasets/scripts/build_climate_profiles.mjs` turns this
file into `backend/data/climateProfiles.json` (the monthly means per district), from which
`backend/services/poultry/heatStress.js` computes the temperature-humidity index for broilers and layers.

**Caveat on `t2m_max_c` and `t2m_min_c`.** NASA defines these as the highest and lowest *hourly* reading in the period,
so they are extremes, not typical days (Shimla reads 43.9 C in its hottest month). Use `t2m_mean_c` for typical
conditions. Monthly means also smooth over hot afternoons, so a month just below the heat stress line can still have
stressful days.

### `district_climate_unresolved.csv` (177 rows)

Districts in `shared/india-locations.json` the geocoder could not place in the right state (many Arunachal Pradesh,
Telangana, Gujarat, West Bengal, Meghalaya and Assam districts, mostly newer or renamed districts). They are
deliberately left out rather than guessed; the state value is used for them.

## `knowledge/`: what the AI assistant reads

`knowledge/manifest.json` lists every document the assistant searches, with its publisher, URL, status (current, older
or unverified) and the known gaps:

- schemes: the NLM-EDP guidelines (2021-26, revised 2024) and the AHIDF guidelines;
- projects and costs: NABARD's 2023-24 unit costs, NABARD's broiler, layer and indigenous poultry model projects, the
  NCDC broiler project report;
- rules: the CPCB guidelines for poultry farms, the DAHD biosecurity guidelines (2015);
- practice: the TNAU poultry expert system (housing, broiler, layer and grower management, brooding, litter,
  equipment, lighting, disease and vaccination, biosecurity) and the Vikaspedia broiler and layer pages.

`python datasets/scripts/fetch_knowledge.py` downloads them into `knowledge/raw/` and extracts the text into
`knowledge/text/` (it needs poppler's `pdftotext`, or `pip install pypdf`). Both folders are git-ignored because some
documents are copyrighted. On 2026-10-20, 20 of the 21 were fetched; the CPCB page timed out and is listed as a gap
(its rules are in `poultry_siting_rules.csv`). The backend also turns the CSVs above and the planner's own norms,
prices, schemes and cost items into passages (`backend/services/rag/corpus.js`), so the assistant can cite them.

## `eval/`: checking the assistant

`eval/assistant-questions.json` holds 85 questions with answers checked against the files above: shed design, birds,
brooding, litter, vaccination, production norms, NABARD unit costs, schemes, CPCB rules, biosecurity, the project's own
numbers, "what if" questions answered by the planner, Hindi and Marathi, edge cases (off-topic, prompt injection, false
premises, doses, typos, follow-ups) and request validation. Each case has regular expressions the answer must and must
not match, and a `source` saying where the answer comes from. Run it with `cd backend && npm run eval:assistant` (real
models; about an hour and a half on a laptop CPU, or `-- --only=id1,id2`). The latest result is in
`docs/remaining/01-run-ai-evaluation.md`.

## Planning defaults

The Earnings step's default prices and norms (`shared/poultry-norms.json`, `planningDefaults`) each name their source,
which the app shows. Chick, feed and vaccine prices come from NABARD's 2023-24 unit costs; the broiler sale price
(Rs 100 a kg live), the contract growing charge and the egg price are assumptions or secondary quotes and are labelled
so. The farmer edits all of them.

## Not included, and why

| Needed by | Data | Status |
|---|---|---|
| Prices | Daily broiler, egg, chick and feed prices | No official API. NECC egg rates and integrators' broiler rates are published as daily web pages only; the defaults are dated snapshots the farmer can change. |
| Costs | Other states' NABARD unit costs | Published by each NABARD regional office; only Jharkhand's are transcribed. |
| Schemes | State poultry schemes | Only Maharashtra's, unverified (no official GR found yet). |
| Housing | IS 2732:1985 (code of practice for poultry housing) | Needs a BIS purchase; its figures come through the TNAU expert system. |
| Risk | Outbreak and culling frequency | No official rate found; the yearly chance is the farmer's to set (2% by default). |

## Regenerating

```sh
node datasets/scripts/build_district_climate.mjs          # about 10 minutes the first time; cached after
node datasets/scripts/build_climate_profiles.mjs          # climateProfiles.json from the climate CSV
node backend/scripts/loadReferenceData.js               # (re)load the climate and poultry CSVs into Postgres
node backend/scripts/loadReferenceData.js poultry       # only the poultry tables
```

`datasets/.cache/` holds the raw API responses and can be deleted safely.

## IMD district rainfall normals (not imported yet)

`data.gov.in` publishes "District Rainfall Normal (mm), monthly, seasonal and annual data, period 1951-2000" from the
India Meteorological Department. It has no API: open the dataset page in a browser, download the CSV and save it here
as `datasets/csv/imd_district_rainfall_normals.csv` (columns STATE/UT, DISTRICT, monthly values, ANNUAL). Then run
`node backend/scripts/buildRainfallProfiles.js`. It writes `backend/data/rainfallProfiles.json` (used by the climate
card and advisories) and lists districts it could not match in `datasets/csv/imd_rainfall_unmatched.csv`.
