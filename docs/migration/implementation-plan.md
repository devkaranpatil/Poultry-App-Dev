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
