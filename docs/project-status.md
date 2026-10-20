# Project status and roadmap

Last updated: 2026-10-20. Poultry Planner (working name) is a working prototype: every feature below runs end to end on
a laptop, against the Supabase database it shares with the polyhouse planner, with the AI on local open-source models.
It was migrated from that polyhouse planner in seven phases (`docs/migration`); the polyhouse code is on the
`polyhouse` git tag, and its own status history ends there.

## What runs where

| Service | Where | Start | Notes |
|---|---|---|---|
| Frontend (React, Vite, Three.js) | http://localhost:8080 | `npm run dev` | designer, 3D shed, the seven steps, AI, saved setups, exports, en/hi/mr |
| Backend API (Express) | http://localhost:5000 | `cd backend && npm run dev` | the poultry calculation, schemes, risk, saved setups, AI routes, district climate |
| AI assistant | inside the backend process | models: `cd backend && npm run models:download` | Qwen3-4B (chat), bge-m3 (search), bge-reranker-v2-m3; CPU only; about 3 GB RAM |
| Database and login | Supabase (hosted, shared with the polyhouse app) | nothing to start | Postgres (profiles, saved setups with `config_type = 'poultry'`, district climate, poultry tables once migrated) and Supabase Auth (email and Google) |

## Poultry: what the planner does

- **Design a shed in 3D** (`docs/3d-scene.md`, `docs/3d-model-references.md`): size and heights, shed type, roof, frame,
  roof sheet, side walls, entry, birds and feeding, each a tab of the design sidebar and a part of the model. Grips,
  G and S keys, undo, landscapes and skies are kept from the polyhouse editor.
- **Flock** from floor area and stocking density (`services/flock.js` and `src/lib/flock.ts`, kept equal by a test).
- **Cost** from NABARD's 2023-24 unit costs: shed rate per sq ft scaled by the shed's envelope, equipment per bird,
  roof sheet, curtains and entry extras, the first batch's working capital, compared with NABARD's unit cost for the
  same flock. Unpriced items are flagged "verify".
- **Earnings** (`services/poultry/production.js` = `src/lib/poultryFinance.ts`): batches a year or the layer cycle,
  birds and eggs sold, feed, running cost, profit, payback and break-even price, independent or on contract.
- **Schemes and loan:** NLM-EDP, AHIDF and state schemes checked against the project, each with its reason; when none
  applies the screens say so and the bank loan (up to 90%) carries the project.
- **Site and rules:** CPCB consent and siting distances above 5,000 birds, NABARD's distance rule, registration, and
  the heat stress months of the district (temperature-humidity index from NASA POWER).
- **Risk:** Monte Carlo over mortality, feed conversion, sale and feed prices, build cost and outbreaks.
- **Report:** PDF in the order of a bank DPR, and Excel with live formulas that equal the app's figures.
- **AI assistant:** answers from 20 official poultry documents, the poultry tables and the planner's own norms; what-if
  questions are answered by the planner.

## Migration, phase by phase (2026-10-19 to 2026-10-20)

| Phase | What changed | Tag |
|---|---|---|
| 1 Rename | code, folders, routes and storage keys use "farm"; the app name lives in `shared/app.json` | `phase-1` |
| 2 Data and types | `shared/poultry-norms.json` (every figure with its source and `verified` flag), limits, the poultry CSVs, `src/types/poultry.ts` | `phase-2` |
| 3 Calculations | flock, cost model, production, heat stress, schemes, siting, risk and what-if for poultry; the NABARD reproduction | `phase-3` |
| 4 Screens and words | the design sidebar's poultry tabs, Site, Cost, Earnings, Loan, Risk and Report steps, exports, en/hi/mr wording, personas | `phase-4` |
| 5 3D shed | trusses, roofs, sheets, walls and curtains, tunnel pads and fans, entry, litter, A-type cages, feeding, instanced flock | `phase-5` |
| 6 AI knowledge | poultry manifest and corpus, poultry search words, backend architecture rewritten, 85-question evaluation set | `phase-6` |
| 7 Finish | leftovers deleted (polyhouse CSVs, crop library, pricing constants, polyhouse labels), docs, coverage, full checks | `phase-7` |

## How it is verified

| Check | Command | Last result (2026-10-20) |
|---|---|---|
| Unit and integration tests | `npm test` | 454 passed |
| Coverage floors | `npm run test:coverage` | statements 70.6%, branches 65.1%, functions 68.4%, lines 72.1% (floors 70/60/65/70) |
| Lint and types | `npm run lint`, `npm run typecheck` | no errors (12 fast-refresh warnings) |
| Production build | `npm run build` | passes |
| Browser tests | `CI=true npm run test:e2e`, run one spec file at a time | 44 passed, 2 skipped (auth 11, dashboard 3, editor 11, interactions 6, layout 2, personas 3, scene 1, workspace 5, mobile 2) |
| 3D sweep | `CI=true npm run test:e2e:scene` | 9 passed in 11.4 min on a laptop CPU: every bird, shed type and roof, frame and roof sheet, side walls and entry, feeding system, the controls, tunnel fans, quality levels and the accessible description |
| Calculation audit | `node backend/scripts/auditCalculations.js` | the six NABARD 2023-24 units reproduced within 1.3% (see `docs/backend-architecture.md`) |
| Assistant evaluation | `cd backend && npm run eval:assistant` | partial: 50 of the first 67 questions on Qwen3-4B; the full run is still to do (`docs/remaining/01-run-ai-evaluation.md`) |

The browser tests are run one spec file at a time on the 16 GB laptop: one run of the whole suite was stopped for lack
of memory. CI runs the whole suite in one go.

## Known limits

- **Unverified rates and prices:** the environment-controlled shed rate, semi-automatic and automatic equipment,
  automatic curtains, roof sheets other than GI, the footbath and anteroom, the egg price and the broiler sale price.
  All are flagged in the data and on screen.
- **The default broiler price leaves almost no profit** on the recommended shed (Rs 6,939 a year at Rs 100/kg;
  break-even Rs 99.41/kg). Check the default against current farm-gate prices.
- **NABARD unit costs for one state** (Jharkhand); banks use their own state's.
- **State schemes:** only Maharashtra's, unverified.
- **Heat stress on monthly means:** afternoons are hotter than the index.
- **AI:** 40-90 s per answer on a laptop CPU; the evaluation found what-if answers quoting the "now" column, vaccine
  ages taken from the layer schedule and a few figures taken from the wrong fact (`docs/remaining`, tasks 02-07).
- **Hindi and Marathi** poultry wording needs a native review.
- **PDF reports are English only** (jsPDF cannot render Devanagari).
- **The backend "API Studio"** (`backend/studio`, a developer page) still animates a polyhouse.

## Roadmap

### Now

1. Run the assistant evaluation to the end and fix what it found (`docs/remaining`, tasks 01-07).
2. Apply the poultry migration to the live Supabase project and load the poultry tables.
3. Check the unverified rates and the default prices with current quotes; native review of Hindi and Marathi.

### Next

1. NABARD unit costs for the main poultry states, and state schemes from their official orders.
2. Price snapshots for broilers and eggs (NECC, integrator rates) with dates, and price risk from their spread.
3. Batch planning: a calendar of placements, vaccinations and sales per shed.

### Then: decide where it runs

- The AI needs about 4 GB of RAM and is slow on a small CPU server. Options: a CPU server with 8+ cores, a small GPU
  server (answers in seconds), or launching the planner first and adding the AI later.
- Production checklist: environment variables, Resend as Supabase's SMTP provider, leaked-password protection in
  Supabase, error monitoring, backups.

### Feature ideas (later)

| Feature | Why | Effort |
|---|---|---|
| Several sheds on one farm (brooder, grower and layer houses) | real farms grow in phases and separate ages | medium |
| Feed formulation from local ingredients | feed is most of the running cost | medium |
| Contract offers compared side by side | farmers choose between integrators | small |
| Answer cache for common questions | cuts the wait for repeat questions | small |
| Offline use (PWA) for field visits | patchy connectivity in rural areas | medium |
| Other species with NLM units (goat, pig) | the scheme engine and CSVs are keyed by species | medium |
