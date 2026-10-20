# Poultry farm planner: implementation plan

This plan turns the polyhouse planner into a poultry farm planner in eight phases. The order keeps the app working and the tests green at the end of every phase. Each phase is one commit or PR, with no Co-Authored-By lines. What each feature becomes is in [feature-changes.md](feature-changes.md); the sources are in [research.md](research.md).

Today's figures:
- 290 tracked files.
- About 122 files mention greenhouse or polyhouse.
- 518 unit tests and 46 browser tests.
- About 3,270 lines of i18n.

## Phase 0: separate the polyhouse app (done 2026-10-19)

1. The polyhouse work was committed in its own repository (`GreenhouseIQ`, commit `956d0c1`, tag `polyhouse-final`). That repository keeps no migration documents.
2. This repository was started fresh from that commit: no shared history and no remote. Its first commit is the polyhouse code plus these documents.
3. Local AI weights are not copied: `backend/.env` points `LLM_MODELS_DIR` at the polyhouse repo's `backend/.models`. Run `npm run models:download` in `backend/` to give this repo its own copy.
4. The app name is a placeholder, defined in one place so it can be changed later (Phase 1).

## Phase 1: rename without changing behaviour (1 to 2 days)

**Status: done (2026-10-20, branch `phase-1-rename`).**
- 499 unit tests pass. The count fell from 518 because the duplicate `/api/polyhouse` tests went with that API.
- 46 Chromium e2e tests pass, plus lint, both typechecks and the build.
- What differs from the table below:
  - Browser storage keys moved to the `farm.` prefix **without** reading the old `greenhouse.` keys. This is a separate app now, so carrying the polyhouse app's settings over would be wrong.
  - Saved records keep their `configType` values (`greenhouse` and `polyhouse`) until Phase 2 changes the database. A record saved as `polyhouse` is read through `normalizeFarmConfig`.
  - Domain names stay until their phase: the `greenhouseType` field, `GreenhouseType`, `options.greenhouse.*` i18n keys, crop and irrigation parts, and the `greenhouse_configs` table in the unused `backend/schema.sql`.
  - The health endpoint reports `service: "farm-backend"`. Report files are named `farm-<place>-<date>`.


This is a mechanical rename. The app still plans polyhouses afterwards, but under neutral names, so later diffs show real changes only.

| From | To |
|---|---|
| `src/components/greenhouse/` | `src/components/farm/` |
| `GreenhouseModel.tsx` | `FarmModel.tsx` |
| `useGreenhouseCalculations` | `useFarmCalculations` |
| `src/types/greenhouse.ts` | `src/types/farm.ts` (`GreenhouseConfig` → `FarmConfig`) |
| `src/types/polyhouse.ts` (duplicate, 916 lines) | deleted, after checking its importers |
| `shared/greenhouse-limits.json` | `shared/farm-limits.json` |
| `/api/greenhouse` | `/api/farm` |
| `/api/polyhouse` | removed (`backend/routes/polyhouse.js`) |
| `greenhouse.*` localStorage keys | `farm.*`, with a one-time migration that reads the old key |
| Test hooks `__greenhouseScene` and the rest | `__farmScene` and the rest (e2e helpers updated) |
| "Greenhouse IQ" in `index.html`, Landing, Logo, report, package names | one constant, `APP_NAME` in `src/config/app.ts` (placeholder "Poultry Planner"), used everywhere, so renaming the app later is a one-line change |

**How:** `git mv` the folders, then a scripted search and replace, reviewed file by file. Do not blindly replace the word "greenhouse" in i18n strings or docs; that is Phase 4.

**Done when:**
- `rg -i "greenhouse|polyhouse" src backend shared e2e` matches only domain wording that Phase 2 to 4 will replace.
- lint, typecheck, unit, build and e2e are green.

## Phase 2: domain data and types (3 to 4 days)

**Status: code done 2026-10-20 on branch `phase-2-domain-data`. The live migration is not applied yet.**

Decisions taken, since none were given:
- Bird types: broiler, layer in cages, layer on the floor, and improved desi birds. Coloured broilers were left out because no source gave their figures.
- Contract farming is included.
- Maharashtra is the first state.

What was built:
- **Norms** (`shared/poultry-norms.json`, read by both sides):
  - floor space per bird for each bird and shed
  - production figures
  - NABARD 2023-24 costs
  - reference prices, each with its source
  - Secondary or old figures carry `verified: false`.
- **Datasets** (`datasets/csv`):
  - `nabard_poultry_unit_costs.csv` (6 rows)
  - `poultry_production_norms.csv` (7)
  - `poultry_scheme_rules.csv` (3)
  - `poultry_siting_rules.csv` (9)
- **Engines:**
  - `backend/data/poultry/schemes.js`: `computeSchemes` checks NLM-EDP, AHIDF and Maharashtra's scheme, gives each a verdict (eligible, check or not eligible) with reasons, and reports `noneApplies` when nothing does.
  - `backend/data/poultry/siting.js`: `sitingRulesFor` returns the CPCB rules above 5,000 birds, NABARD's 1 km rule for bank-financed farms, and registration for every farm.
- **Flock size:** `backend/services/flock.js` and `src/lib/flock.ts`; a test keeps the two equal.
- **Types:** `src/types/poultry.ts` (`PoultryConfig`, defaulting to a 7 m by 14 m broiler shed of about 1,050 birds). The screens keep `FarmConfig` until Phases 3 and 4. Changing it now would break every screen at once.
- **Database:** `supabase/migrations/20261020020000_poultry_reference_data.sql`, additive only because the database is shared with the polyhouse app.
  - It creates four `poultry_*` tables, readable through the API and writable only by the backend.
  - It widens `saved_configurations.config_type` to accept `poultry`.
  - `loadReferenceData.js poultry` loads only these tables, so the polyhouse tables are never refilled from this repository.
- **Tests:**
  - `src/test/poultry-data.test.ts` (20 tests): every figure has a known source, the CSVs equal the code, flock size matches between browser and server, scheme verdicts, siting thresholds.
  - `sql-database.test.ts`: the migration in PGlite, the replaced constraint, and the poultry-only load.

Still open:
- **Apply the migration to the shared Supabase database.** I wasn't allowed to change the shared database myself; see the README.
- ~~Run the full unit and e2e suites.~~ Done: 521 unit tests and 46 e2e tests pass. The database tests use PGlite, never the shared database.
- **Agmarknet names for egg and poultry.** The query to data.gov.in did not finish (the API was slow); retry it in Phase 3.
- **Official Maharashtra scheme GR, NLM 2025 copy, current prices.** Not found yet; the figures stay marked unverified.


Data first, with tests, before any screen changes.

1. **Collect the missing sources** (research.md section 7):
   - the official NLM 2025 copy
   - Maharashtra NABARD unit costs
   - Agmarknet poultry and egg commodity names
   - current 2026 prices
   - the Maharashtra scheme GR
   - Save them under `datasets/knowledge/raw` with the manifest.
2. **CSV datasets** (`datasets/csv`, loaded by `backend/scripts/loadReferenceData.js`):
   - `nabard_poultry_unit_costs.csv`: state, year, unit, flock, unit cost, Rs/sq ft, Rs/bird, source.
   - `poultry_production_norms.csv`: bird type, housing, sq ft/bird, rearing days, cleaning days, mortality, FCR, sale weight, eggs/bird, feed kg (grower and layer), source.
   - `poultry_scheme_rules.csv`: scheme, state, eligibility rule, percent, cap, category uplift, source.
   - `poultry_siting_rules.csv`: rule, distance in m, applies above N birds, source (CPCB, NGT, NABARD).
3. **Backend data modules:**
   - `backend/data/pricing.js` → poultry rates (per sq ft, per bird, fixed items).
   - `cultivation.js` → `birds.js` (bird library and feeding systems).
   - `subsidySchemes.js` → `poultrySchemes.js` with `computeSchemes()`.
   - New `siting.js`.
4. **Types:** the `FarmConfig` fields in feature-changes.md section 1, and `flockSize()` and `stockingDensityDefault()` in `src/lib/flock.ts`. The frontend and backend share one implementation, or a test keeps them equal, like `finance.ts` and `returns.js` today.
5. **Supabase migration** `2026xxxx_poultry_domain.sql`:
   - Add `domain` and `schema_version` to `saved_configurations`.
   - Create `scheme_rules` (replaces `midh_area_limits`).
   - Load the NABARD rows into `cost_norms`.
   - Keep `mandi_prices_daily`.
   - Mark old rows `domain = 'polyhouse'`, so they are hidden but not lost.

**Tests:**
- Every CSV equals its code table.
- `computeSchemes` gives the right verdict for:
  - a 1,000 + 100 LIT parent farm (NLM, 50%, Rs 25 lakh cap)
  - a 5,000-bird broiler farm (no central scheme)
  - an SC/ST applicant in Maharashtra (75%)
- Siting rules switch on at 5,000 birds.
- `flockSize` for each bird type and housing.

## Phase 3: calculations (4 to 5 days)

**Status: done 2026-10-20 on branch `phase-3-calculations`.** The new engines sit beside the polyhouse ones, so the screens keep working until Phase 4 moves them over and deletes the old code.

What was built:
- **Cost** (`backend/services/poultry/costModel.js`):
  - Shed civil work per sq ft (NABARD 2023-24), scaled by the roof and wall envelope against the open shed NABARD prices.
  - The difference for another roof sheet, automatic curtains, footbath and anteroom.
  - Equipment per bird by feeding system, and electrical work at 3% of civil.
  - For layers, the feed store, fencing and water supply per 5,000 birds.
  - The first batch's working capital, as NABARD counts it.
  - Unpriced choices are listed in `unsourcedRates`.
- **NABARD reproduction:** all six Jharkhand units come out within 1.3% of NABARD's own figure (`node backend/scripts/auditCalculations.js`, which replaces the polyhouse audit). A test holds them to ±10%.
- **Heat stress** (`heatStress.js`):
  - THI from the district's monthly mean temperature and humidity, which `build_climate_profiles.mjs` now writes into `climateProfiles.json`.
  - Weighted 0.85 for broilers and 0.6 for layers; above 30 is severe.
  - It gives advice, not a surcharge.
- **Production and returns** (`production.js`, with `src/lib/poultryFinance.ts` kept equal by a test):
  - Broiler and desi batches, independent or contract.
  - Layers as one flock from chick to cull (20 + 52 weeks + cleaning).
  - Break-even price per kg or per egg, and the batch calendar.
- **Calculator** (`calculator.js`, `POST /api/poultry/calculate`):
  - Validation (`validators/poultryValidator.js`, `shared/poultry-limits.json`) with the shed-type rules.
  - Flock, cost, the NABARD comparison, schemes, siting, climate, returns and calendar.
- **Risk** (`services/risk/poultryRisk.js`, `POST /api/risk/poultry/simulate`):
  - Draws mortality, FCR (or feed eaten for layers), sale price, feed price, build cost and an outbreak that loses a batch.
  - Every simulated year goes through `production.js`.
  - Under contract, price and feed risk fall to zero.
- **Loan** (`src/lib/loan.ts`): `poultryLoanTerms()` from the NABARD model projects. Broiler: 75%, 12.5%, 7 years. Layer: 8 years with 1 year of grace. Desi: 90%, 12%, 5 years.
- **New sourced figures** in `shared/poultry-norms.json`:
  - IJAH 2025 broiler study: FCR 1.8, labour Rs 5.62 and other costs Rs 4.80 a bird, manure and bags.
  - NABARD's desi sale price, Rs 150/kg.
  - NECC egg rate, July 2026 (secondary).
  - Planner assumptions, marked unverified: broiler sale Rs 100/kg, growing charge Rs 7/kg, roof sheets, curtains, footbath, anteroom, semi-automatic and automatic equipment, controlled-shed rate.
- **Tests:** `src/test/poultry-calculations.test.ts` (30 tests). In all, 551 unit tests pass, along with lint, both typechecks and the build.

What differs from the table below:
- **Market prices:** today's data.gov.in feed (5,873 records, 116 commodities, 20.10.2026) has **no egg or poultry commodity**. So there is no commodity map. Poultry prices stay user inputs with published defaults, and the risk model's price spread is a labelled assumption.
- **`whatIf.js`** moves with the AI routes in Phase 4 and 6, because it is wired into the chat. The poultry calculator it will call is ready.
- **The layer cycle** keeps the grower phase in the same shed: one flock at a time, 518 days. NABARD's 1:2 system uses a separate grower house, which this planner does not price.
- **`cageTiers`** shapes the 3D shed only. NABARD prices cages per bird, and the 0.85 sq ft per bird of its layer model already allows for the tiers.


| File | Change |
|---|---|
| `backend/services/costModel.js` | Shed civil, roof sheet (envelope with a 1.07 m overhang), side walls and curtains, equipment per bird, cages per tier, fixed items, controlled-shed kit. Climate: suggestions instead of a flat surcharge. ±10% band kept |
| `backend/services/calculator.js`, `routes/calculatorRouter.js` | Validate `FarmConfig` (update the zod schema in `backend/validators`); return cost, flock, schemes, siting and climate with heat stress |
| `backend/services/returns.js`, `src/lib/finance.ts` | Broiler, layer and desi production models; independent and contract modes (feature-changes.md section 5). The equality test is kept |
| `src/lib/loan.ts` | Defaults: 25% margin, 12.5% interest, 5 to 8 years, optional moratorium; back-ended subsidy handled after completion |
| `backend/services/risk/monteCarlo.js`, `priceSpread.js` | Mortality, FCR, sale price, feed price and an outbreak event; histograms unchanged |
| `backend/services/marketPrices.js`, `src/lib/mandi.ts` | Commodity map for eggs and broilers; a unit field (per egg, per kg) |
| `backend/services/whatIf.js` | Levers: flock size, bird type, housing, farming model, prices |
| `backend/scripts/auditCalculations.js` | Rewritten to check the NABARD broiler 500 and layer 5,000 models: the app must reproduce their unit cost within ±10% when given their own inputs |

**Tests:**
- Port the existing calculation tests to the new formulas.
- Add a "NABARD reproduction" test for each model unit: the 500 and 1,000-bird broiler units and the 5,000-bird layer unit.

## Phase 4: screens and words (4 to 5 days)

**Status: done 2026-10-20 on branch `phase-4-screens`.**

The backend:
- `/api/farm/calculate` takes `{ config, assumptions }` and returns the poultry result. `/api/risk/simulate` runs the poultry risk model.
- The polyhouse calculator, validator, MIDH table, crop advisor, mandi services and the mandi ingest job are removed. The ingest job would have doubled the polyhouse repository's writes to the shared table.
- The AI route reads poultry facts from the server's calculation, and the crop-ranking endpoint is gone.
- `whatIf.js` uses the poultry levers: flock size, bird, shed, farming model, roof, sheet, feeding, state and prices.
- Saved setups are poultry-only. In the shared database the app never lists, overwrites (409) or deletes the polyhouse planner's rows.

The screens:
- New sidebar tabs: Size (with flock size and stocking density), Shed, Roof, Frame, Roof sheet, Side walls, Entry, Birds (farming model, cage tiers), Feeding, and Location (with the beneficiary category).
- Choices that do not fit the bird or shed are shown but disabled.
- The step pages:
  - Site & rules: climate, heat stress and the siting checklist.
  - Cost: the shed lines, the first batch, the NABARD comparison and every scheme's verdict.
  - Earnings: production, the batch calendar, and the assumptions with their sources.
  - Loan: NABARD terms per bird.
  - Risk: adds the outbreak chance.

The report:
- The PDF follows the DPR order (technical, financial, managerial, compliance) and includes the biosecurity list.
- The Excel workbook's production formulas reproduce the app's figures; a test evaluates them.

Wording and branding:
- English, Hindi and Marathi are rewritten for poultry. Unused polyhouse keys are deleted, and a test checks that every key the screens build exists.
- The logo uses `APP_NAME`. The landing page has new SVG illustrations in place of the greenhouse photos.

Checks:
- 448 unit tests pass.
- The e2e specs are updated, with three poultry personas: a contract broiler farm of 5,000 birds, a cage layer farm of 5,000, and a rural parent farm of desi birds.

What differs from the plan:
- The 3D scene still draws the polyhouse until Phase 5. It gets the nearest shapes through `scene/legacyConfig.ts` (toSceneConfig/fromScenePatch). Size, eaves and ridge drags reach the shed.
- The editor e2e tests that checked polyhouse-only options were removed; Phase 5 adds the shed equivalents.
- The plan's separate `SitingChecklist.tsx` lives in `ReferenceCards.tsx`, next to the heat, NABARD and scheme cards.


1. **`DesignSidebar.tsx`:**
   - Tabs: Size, Housing, Roof, Frame, Roof sheet, Side walls, Entry, Birds, Feeding, Location.
   - New controls: stocking density, cage tiers, farming model.
   - A flock-size input that resizes the length.
   - New option thumbnails in `OptionThumb.tsx`.
2. **Steps:**
   - `site` becomes "Site and rules": the climate card plus heat stress, and a new `SitingChecklist.tsx` built from `SubsidyChecklist.tsx`.
   - `cost` shows the NABARD comparison and schemes.
   - `earnings` gains a batch calendar.
   - `risk` shows the new inputs.
3. **`ReturnsPanel`, `LoanPanel`, `RiskPanel`, `ReferenceCards`:** new labels, units (birds, kg, eggs) and the assumptions editor.
4. **Report** (`src/lib/export/reportData.ts`, `pdfReport.ts`, `excelReport.ts`):
   - DPR section order: technical, financial, managerial, compliance.
   - Flock chart, schemes with their verdicts, siting checklist, biosecurity list.
5. **i18n:** rewrite every greenhouse string in `src/i18n/messages.ts` in en, hi and mr. Keep the key structure, renaming `crop.*` → `birds.*` and so on. Ask a native speaker to review the Hindi and Marathi poultry terms.
6. **Landing page, WelcomeGuide, Logo, `index.html` title, support page, legal pages:** the new name and story.

**Tests:**
- Update the RTL tests for the sidebar, steps, panels and export.
- Add tests for the siting checklist and the flock-size input.

## Phase 5: the 3D shed (5 to 7 days)

This phase can run in parallel with Phase 4 once Phase 2's types exist.

1. **Reference images first:** open and controlled Indian broiler sheds, monitor roofs, A-type layer cages, pan feeder and nipple lines, curtains, cooling pads. Record them in `docs/3d-model-references.md`.
2. **`scene/structureGeometry.ts` and `structureLayout.ts`:**
   - Truss bays (about 3 m), RCC or steel posts, gable, monitor and lean-to roofs.
   - Overhang; low wall and mesh.
3. **New part models:**
   - `RoofSheetModel` (corrugated texture)
   - `SideWallModel` (wall, mesh, curtain with a roll amount; tunnel wall with pad and fans)
   - `EntryModel` (door, footbath, anteroom)
   - `BirdFlock` (instanced low-poly chickens; broiler, layer and desi colours; a visual cap and slight random poses)
   - `FeedingLines` (round feeders and bell drinkers, pan and nipple lines, troughs)
   - `CageRows` (A-type, 2 to 4 tiers)
   - `LitterFloor`
   - Extras: brooder hovers, feed store, generator, tank
4. **Reuse unchanged:** `EditHandles`, `instancing`, `SelectionOutline`, the camera, `ViewGizmo`, `ViewportTools`, `SceneEnvironment`, and the G/S modal transform. Remove `CropField`, `IrrigationSystem`, `cropParts`, `irrigationParts` and `RoofPie`.
5. **Part names** for selection: `size`, `housing`, `roof`, `frame`, `roofSheet`, `sideWalls`, `entry`, `birds`, `feeding`.

**Tests:**
- Port `crop-scene.test.ts` → `bird-scene.test.ts` (part counts and the cap).
- Update the scene e2e sweep (`e2e/scene*.spec.ts`).
- Take screenshots at each quality level and check them against the reference images.

## Phase 6: AI advisor knowledge (3 to 4 days)

1. **`datasets/knowledge/manifest.json`:** the poultry sources (feature-changes.md section 9). Fetch them with `datasets/scripts/fetch_knowledge.py` into `raw/` and `text/`, and record gaps in `gaps`.
2. **`backend/services/rag/corpus.js`:**
   - Generated passages come from `birds.js`, `pricing.js`, `poultrySchemes.js` and `siting.js`.
   - Swap the docs list for the poultry docs.
   - Rebuild the embedding store.
3. **Prompts** (`backend/routes/ai.js`, `services/ai.js`): the domain wording, and the rule that subsidy figures come from the engine, never from the model.
4. **`datasets/eval/assistant-questions.json`:** about 70 poultry questions across facts, what-if, project and edge.
   - Run `npm run eval:assistant` on the 4B model.
   - Record the score in `docs/project-status.md` and in the assistant-findings memory.

## Phase 7: finish (2 days)

1. Run the full checks: lint, typecheck, unit, build, `CI=true npm run test:e2e`, and the 3D sweep.
2. **Personas e2e:**
   - a first-time broiler farmer (5,000 birds, contract)
   - a layer entrepreneur (5,000 in cages, independent)
   - a rural LIT parent farm (NLM case)
3. **Docs:**
   - `README.md`
   - `docs/project-status.md`: a new "Poultry" section, the verification table, known limits such as unverified rates
   - `datasets/README.md`
4. Delete leftovers: the polyhouse CSVs, crop library and MIDH knowledge, kept only on the `polyhouse` tag.
5. Run the audit script and the eval, then report.

## Size and order

| Phase | Days (one developer) | Can run in parallel with |
|---|---|---|
| 0 Separate | done | — |
| 1 Rename | 1-2 | — |
| 2 Data and types | 3-4 | — |
| 3 Calculations | 4-5 | 5 (after Phase 2) |
| 4 Screens and words | 4-5 | 5, 6 |
| 5 3D shed | 5-7 | 3, 4 |
| 6 AI knowledge | 3-4 | 4, 5 |
| 7 Finish | 2 | — |
| **Total** | **about 23 to 30 days**, about 15 with 3 parallel agents after Phase 2 | |

## Risks

| Risk | Mitigation |
|---|---|
| Rates and prices are old (NABARD model projects date from about the 2010s) | Use the 2023-24 unit costs as norms; mark every unverified rate with **verify** in the data and in the UI, as `unsourcedRates` does today |
| No central subsidy for an ordinary farm disappoints users | Say so clearly; show state schemes and the bank loan; NLM only for the LIT parent farm |
| Thousands of birds in 3D are slow | Instancing with a visual cap, as with the crop cap; simpler birds at Lite quality |
| Hindi and Marathi poultry terms | A native review before release |
| Egg and broiler price feeds have no official API | Manual CSV snapshots with dates; user inputs with published ranges |
| The scope grows (dairy, goats, fish) | v1 is poultry only; the scheme engine and CSVs are keyed by species so NLM goat and pig units can follow |
