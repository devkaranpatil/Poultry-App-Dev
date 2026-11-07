# Project status and roadmap

Last updated: 2026-11-07. **What is still open for launch lives in `docs/launch-readiness.md`;** this file describes
what the product does and how it is checked. Poultry Planner (working name) is a working prototype: every feature below runs end to end on
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

## After the migration

What is still open is in `docs/remaining`, one file per task.

### 2026-10-23: the assistant evaluation and its fixes (branch `ai-eval-fixes`)

**The evaluation, run in full on the code before the fixes:** 65 of 85 (fact 29/38, project 9/12, what-if 7/11,
edge 12/15, language 3/4, http 5/5). The report is `backend/.data/eval-2026-10-23T02-20-31-275Z.txt`.

**What was fixed, each with unit tests** (details in `docs/remaining` 01-07 and 11):

| Fault | Fix | Where |
|---|---|---|
| What-if answers quoted the "now" figures | the figures with the change come first, in their own block, with a rule to answer from them | `services/whatIf.js` (`scenarioBlock`) |
| "10 km long" got general advice | sizes in km, feet or sq ft count in metres, so the planner's limit is reached | `services/whatIf.js` (`groundExtraction`) |
| NABARD's unit cost quoted as the project's total | the cost facts are named for what they cover (`totalWithFirstBatch`, ...) | `routes/ai.js` (`buildProjectFacts`) |
| Broiler vaccine ages from the layer table | the broiler table was in no passage: table cells, one per paragraph, were taken for headings and dropped (about 150 tables in 19 documents); they are now joined under their heading. A question naming a bird ranks its guides a little higher | `services/rag/text.js` (`chunkText`), `routes/ai.js`, `birdKind` tags in the manifest |
| Quarantine of 10 days instead of 21 | the 21-day sentence was cut from the shown text; synonyms for "kept apart" and "join", and a sentence with a figure is preferred for "how long" | `services/rag/text.js` (`focusPassage`) |
| General questions answered with the project's figures; CPCB distances applied to a small farm | rule 1: general questions from the sources, "my farm" questions from the project facts | `routes/ai.js` |
| "Lower the heat 50 °F each week" | the lost degree signs ("reduce 50F" is 5 °F) are repaired in three more documents | `services/rag/text.js`, manifest |
| CPCB page missing | fetched and trimmed to the article; 34 documents | `fetch_knowledge.py` (`textStart`, `textEnd`) |

**Checks:** 459 unit tests pass, typecheck and lint have no errors.

### 2026-11-02: the rerun on the fixed code, on a GPU

**78 of 85 (92%)**, up from 65: fact 35/38 (29), project 11/12 (9), what-if 9/11 (7), edge 15/15 (12), language 3/4
(3), http 5/5. Qwen3-4B with 20 of its 36 layers on the GPU and a 4,096-token context; most answers took 20-30 s and
what-if answers 70-135 s. The run was in two parts (the first was stopped for lack of memory after 57 questions; same
questions and settings, model reloaded). Report of the second part: `backend/.data/eval-2026-11-02T10-51-30-365Z.txt`
on the machine that ran it; the first part is only in that run's log.

The seven failures, and what was done the same day:

| Question | What the answer lacked | Done |
|---|---|---|
| whatif-puf | Rs 5.3 lakh; answered in 19 s, so the planner was never asked | "how much would the shed cost with ..." now counts as a what-if (`looksLikeWhatIf`) |
| whatif-5000 | the 5,010 birds the longer shed holds | the planner block says the number asked for and the number the shed holds, and to give both (`planScenario` note) |
| project-siting | the rules that bind a 1,054-bird farm | the facts list the rules for this farm and say the CPCB rules do not apply at 5,000 birds or fewer (`buildProjectFacts`, `siting`) |
| brooding-reduce | "70" (°F) | the text is right after the repair; TNAU says "until it reaches the room temperature", which is also right, so the question now accepts it |
| litter-max | the 8-12 inch depth | open: a keyword search finds a `tnau-housing` passage with the range first; read the answer in the GPU report |
| space-controlled | 0.7 sq ft per bird | open: a keyword search finds the norms passage second; read the answer in the GPU report |
| hi-broiler-space | 1 sq ft (Hindi) | "डीप लिटर" and "जगह" are now swapped for "deep litter" and "space" before the question is translated (`FARMING_TERMS`) |

The code fixes have unit tests; none is yet confirmed by the model (rerun only those questions with
`npm run eval:assistant -- --only=whatif-puf,whatif-5000,project-siting,brooding-reduce,hi-broiler-space`).

## How it is verified

| Check | Command | Last result (2026-10-20) |
|---|---|---|
| Unit and integration tests | `npm test` | 460 passed (2026-11-02) |
| Coverage floors | `npm run test:coverage` | statements 70.6%, branches 65.1%, functions 68.4%, lines 72.1% (floors 70/60/65/70) |
| Lint and types | `npm run lint`, `npm run typecheck` | no errors (12 fast-refresh warnings) |
| Production build | `npm run build` | passes |
| Browser tests | `CI=true npm run test:e2e`, run one spec file at a time | 44 passed, 2 skipped (auth 11, dashboard 3, editor 11, interactions 6, layout 2, personas 3, scene 1, workspace 5, mobile 2) |
| 3D sweep | `CI=true npm run test:e2e:scene` | 9 passed in 11.4 min on a laptop CPU: every bird, shed type and roof, frame and roof sheet, side walls and entry, feeding system, the controls, tunnel fans, quality levels and the accessible description |
| Calculation audit | `node backend/scripts/auditCalculations.js` | the six NABARD 2023-24 units reproduced within 1.3% (see `docs/backend-architecture.md`) |
| Assistant evaluation | `cd backend && npm run eval:assistant` | 78 of 85 on Qwen3-4B on a GPU (2026-11-02), up from 65 before the fixes of 2026-10-23 |

The browser tests are run one spec file at a time on the 16 GB laptop: one run of the whole suite was stopped for lack
of memory. CI runs the whole suite in one go.

## Known limits

- **Unverified rates and prices:** the environment-controlled shed rate, semi-automatic and automatic equipment,
  automatic curtains, roof sheets other than GI, the footbath and anteroom, the egg price and the broiler sale price.
  All are flagged in the data and on screen.
- **At today's prices the default shed loses money in Maharashtra.** With feed at Rs 35 and chicks at Rs 40 (NABARD
  Maharashtra 2025-26) the break-even is Rs 111.5/kg, and Maharashtra's farm-gate price on 4 Nov 2026 was Rs 95: a loss of
  Rs 1,93,935 a year on the 14 x 7 m shed. The broiler price swung from Rs 115 to Rs 138 to Rs 99 between June and
  August 2026, so read a single price as one point in a range. The sale price now starts at the state's rate
  (`planningDefaults.meat.broiler.saleInrPerKg.byState`; Rs 100 where none was found), and the egg price likewise.
- **Prices are secondary quotes** (checked 2026-11-05): state broiler rates (todaysbroilerrate.in, poultrysite.in), NECC
  egg rates, the environment-controlled shed (Rs 800 per sq ft, range 700 to 900) and the contract growing charge
  (Rs 10 a kg). Feed (Rs 35) and chicks (Rs 40) are NABARD's published Maharashtra figures. See the vault note
  "05 Price Research 2026-11".
- **NABARD unit costs** are in for all 28 states (task 12, 2026-11-06); a bank uses its own state's.
- **State schemes:** 11 states (task 12). Maharashtra's rules are read from the GR of 9 March 2026 (a copy; the original on gr.maharashtra.gov.in is still to be linked). Six scheme PDFs (Bihar, Odisha, Uttarakhand, Uttar Pradesh) are scans; they are read with OCR (Tesseract, Hindi and English) by `fetch_knowledge.py`, so figures may carry reading errors. A source under 500 characters is still reported as unusable, not as coverage.
- **Heat stress on monthly means:** afternoons are hotter than the index.
- **AI:** 40-90 s per answer on a laptop CPU, 20-30 s with part of the model on a GPU (what-if answers 70-135 s).
  The evaluation passes 78 of 85; five of the seven failures are fixed but not yet rerun, two are open
  (`docs/remaining/01-run-ai-evaluation.md`).
- **Hindi and Marathi** poultry wording needs a native review.
- **PDF reports are English only** (jsPDF cannot render Devanagari).
- **The backend "API Studio"** (`backend/studio`, a developer page) still animates a polyhouse.

## Roadmap

### Now

1. Rerun the five questions fixed on 2026-11-02, and read the two open answers in the GPU report (`docs/remaining`, task 01).
2. ~~Apply the poultry migration to the live Supabase project~~ (done 2026-11-05).
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
