# Backend architecture and calculation audit

Last audited: 2026-10-13. Rerun `node backend/scripts/auditCalculations.js` after changing a rate, a state profile or a dataset.

## Request flow

```
Browser (React/Vite :8080)
  -> Express app (backend/app.js: request id, rate limit, CORS, JSON body)
     -> routers: /api/greenhouse, /api/polyhouse   (one factory, calculatorRouter.js)
     -> /api/auth, /api/configurations              (repositories -> Postgres)
     -> /api/ai/*                                   (local models + retrieval; off until the models are installed)
     -> /api/risk/simulate                          (Monte Carlo on the calculation; public, rate limited)
     -> /api/location, /api/health
```

`POST /api/{greenhouse|polyhouse}/calculate` does, in order:

1. `normalizeAndSanitizeConfig` fixes aliases (`gi-steel` -> `galvanized_iron`), locks flat-roof ridge height, forces shade-net cover/door.
2. `configValidator` checks ranges (`shared/greenhouse-limits.json`), enums and that the district belongs to the state.
3. `buildCalculationResult` computes area, volume, climate profile, crops, the cost and the scheme subsidy (`data/subsidySchemes.js`) (pure functions, no I/O).
4. `buildReference` (database) attaches the official context: government norm and subsidy card (both taken from step 3, so they always agree with the returns), area rule, district climate, mandi prices. It returns `null` if the database is down, so neither the price nor the subsidy depends on it.

## Layers

| Layer | Files | Rule |
|---|---|---|
| Routes | `routes/*.js` | HTTP only: parse, call a service, shape the response |
| Services | `services/costModel.js`, `calculator.js`, `cropAdvisor.js`, `returns.js` | Pure calculation, unit-tested without a server. `returns.js` is the returns arithmetic of `src/lib/finance.ts`, kept equal by a test |
| What-if | `services/whatIf.js` | Turns a chat question's change into planner figures (see the AI section) |
| Reference services | `services/referenceData.js`, `marketPrices.js` | Read official data from Postgres, cached 10 minutes, never change the price |
| Risk | `services/risk/monteCarlo.js`, `priceSpread.js` | Pure, seeded simulation; the price spread is read from the mandi table (or a stated assumption) |
| Data | `data/pricing.js`, `stateClimate.js`, `climateProfiles.json`, `cultivation.js`, `subsidySchemes.js` | Rates, profiles and the published subsidy norms. `climateProfiles.json` is generated from the NASA CSV so the price needs no database |
| Validation | `validators/configValidator.js`, `validators/requestSchemas.js` | The planner config keeps its own field-by-field rules (messages the UI shows); zod schemas check the bodies of saved setups, AI requests and risk requests |
| Repositories | `repositories/index.js` | All SQL for users, reset tokens, saved setups |
| Database | `config/db.js`, `supabase/migrations/*` | Supabase Postgres; PGlite in-process for dev and tests |
| Scripts | `scripts/` | `loadReferenceData`, `ingestMandiPrices`, `auditCalculations`, `downloadModels`, `evalAssistant` |

Dependency note: `backend/package.json` has an npm `overrides` entry pinning `simple-git` 4.0.2. `node-llama-cpp` 3.22 asks for `simple-git` ^3.36, whose dependency `@simple-git/argv-parser` < 2.0.1 has a critical advisory that fails the CI audit; no patched 3.x exists. `node-llama-cpp` only uses it to clone and patch llama.cpp when building from source, and all eight methods it calls exist in 4.x. Remove the override once `node-llama-cpp` depends on a patched version.

## Data in Supabase

| Table | Source | Used for |
|---|---|---|
| `app_users`, `saved_configurations` | the app | profiles (linked to Supabase Auth by `auth_user_id`) and saved setups (no public policies) |
| `cost_norms` (19 rows) | NHB cost norms PDF | official labels for the norm card; the AI's knowledge base (the subsidy itself is computed in code, see below) |
| `midh_area_limits` | MIDH letter of 2025-08-12 | the 4,000 m2 rule |
| `district_climate_monthly`, `district_climate_unresolved` | NASA POWER | district climate card |
| `mandi_prices_daily` | data.gov.in / Agmarknet | market price card |

## The cost model

Everything is Rs per m2 of FLOOR area, summed and then multiplied by one climate factor:

```
structure   = area x structure rate  (x shade-net factor for shade-net houses)
cover       = area x cover rate
ventilation = area x ventilation rate
foundation  = area x 180
irrigation  = area x irrigation rate
cooling     = area x 639 (climate-controlled only; the response calls it electricalCost)
labour      = 25% x (structure + cover + foundation)
misc        = area x 35
total       = round(sum x climate factor)     climate factor = 1 + 5% if state rainfall > 2,000 mm
                                                         + 3% if the district's hottest month averages 35 C or more
range       = total +/- 10%
```

Volume: flat = area x gutter; gable = area x (gutter + rise/2); gothic = area x (gutter + 2/3 rise). These are the correct mean-cross-section formulas for a triangle and a parabolic arch.

## What the audit verified

- Volume formulas and the cost reconciliation (lines + climate amount = total) are correct and tested.
- Against the official norms, the model's structure + cover rate for a naturally ventilated house is 15% above the norm for steel (970 vs 844) and 16% for bamboo (520 vs 450). That consistent uplift is treated as the model's calibration.

## What was changed (and why)

| Change | Evidence | Price effect (30 x 10 m, Goa) |
|---|---|---|
| Shade-net structure now scales by the official shade-net to covered-house ratio (710/844 steel, 360/450 bamboo) | NHB table rows | -11.4% |
| Fan-and-pad cooling set to the official fan-and-pad minus tubular difference (1,400 - 844 = 556) scaled by the model uplift = 639 Rs/m2, replacing the old 220 | NHB table rows | +23.4% |
| Subsidy: NHB's 50% applies to projects of 4,000 m2 and above; below that the state horticulture mission applies and its norms are not in our data, so the NHB rate is labelled a reference. NHB assistance is limited to Rs 56 lakh per project | NHB table row A.2 and the 2025-08-12 letter | none (display only) |
| New CSV row for the A.2 project norm (Rs 112 lakh, 50% limited to Rs 56 lakh) | NHB table | none |
| Response lists inputs that do not change the price (`diagnostics.notPriced`), and the cost panel says so | audit part C | none |

The covered-house benchmark (30 x 10 m, Goa, steel) is unchanged at Rs 495,338.

A second round fixed the findings that could be fixed with evidence:

| Change | Evidence | Effect |
|---|---|---|
| Heat surcharge now uses the district's hottest-month mean temperature (35 C or more adds 3%) and not the annual state mean. State temperature and humidity come from NASA | No state's annual mean exceeds 30 C, so the old rule only fired for Rajasthan, through a wrong hand-typed 32 C. 170 of 540 districts now qualify, mostly the north-west and central plains | Churu +3%, Pune none; Rajasthan districts below 35 C lose the old 3%. Goa has no NASA data and is unchanged |
| The district card no longer calls NASA's `T2M_MAX` a "peak". It shows the hottest-month mean, and the hourly extremes are labelled as extremes | NASA defines `T2M_MAX` as the maximum hourly reading in the period (Shimla reads 43.9 C) | wording only |
| Crop yields come from three published papers, per crop cycle, with a source link, and crops without a source say "unverified estimate" | `datasets/csv/crop_yields_published.csv` | Cucumber 200-300 t/ha becomes 17-33; tomato 40-60 becomes 45-84; capsicum 70-130 becomes 36-60; gerbera 250-350 becomes 132-396 stems/m2/year |
| 3D scene: the dust particles are re-created when the quality level changes | Resizing the building threw 130-170 WebGL errors per run | regression test `e2e/scene.spec.ts` |

## Open findings (need a decision or data)

1. **Door type, crop and district do not change the price.** Roof shape and gutter and ridge height now do: structure and cover scale with the real envelope surface (walls, gable ends, roof) relative to the NHB reference house (technical standard NHB-PH-Type 02-2011: gutter 4 m, ridge 6 m, gable), so the default house keeps its Rs 4,95,338 benchmark. The door has no official rate (the NHB norm treats it as part of the structure).
2. **Aluminium and glass have no official price, and neither does the door.** The NHB/MIDH cost norms (the current table and the 2008-09 document, searched in full) have no row for any of them. The model keeps assumed rates for aluminium (1,200) and glass (260) and the API returns `diagnostics.unsourcedRates`, which the Results tab shows as a warning. The door stays unpriced.
3. **Irrigation, ventilation, foundation, labour and misc rates are unsourced assumptions.** No public price dataset exists for them.
4. **The 35 C heat threshold and the +3% are the app's own choices.** The data shows where the hot districts are, but no source says what heat should cost.
5. **Rainfall is still one typed number per state until the IMD file is imported.** NASA under-reads hill states (Sikkim 1,346 vs 2,700). The fix is built: download the IMD district rainfall normals from data.gov.in (it has no API, so it needs a browser download), save it as `datasets/csv/imd_district_rainfall_normals.csv` and run `node backend/scripts/buildRainfallProfiles.js`. District values then replace the state value and `climate.rainfallSource` says which one was used. The file is 1951-2000 data on the districts of that time, so renamed or split districts are reported as unmatched and keep the state value.
6. **Yields are from small trials in two places** (mid-hill Meghalaya for vegetables, Junagadh for gerbera). Other regions will differ, and the other crops (lettuce, strawberry, chilli, carnation and so on) have no verified yield. Suitability ratings and seasons per climate group are the app's own judgement.
7. **The MIDH 2025 slabs stop at 2,500 m2,** while the letter of 12.08.2025 raised the state-mission limit to 4,000 m2 without new rates. Between 2,500 and 4,000 m2 the last published slab rate is applied and the app says so. (Resolved earlier gap: the slab norms themselves now come from the MIDH Operational Guidelines 2025.)
8. **The season advisory depends on the server's clock**, not the user's location or the district's monthly climate.
9. `ventilationMultiplier` in `climatePhase25.js` is computed but never used.

## Subsidy schemes

`data/subsidySchemes.js` decides which scheme a project falls under and how much it supports. Every calculation carries the result as `result.subsidy`; the reference card, the returns panel, the PDF and Excel exports, the AI's project facts and the risk model all read that one object.

| Project size | Scheme | Norm (Rs per m2, plain areas) | Source |
|---|---|---|---|
| under 4,000 m2 | State horticulture mission (NHM/HMNEH) | fan and pad 1,800 / 1,600 / 1,500 and naturally ventilated tubular 1,200 / 1,050 / 1,000 for up to 500, 1,008 and 2,500 m2; bamboo 450; shade net 710 (tubular) or 450 (bamboo); 15% higher in NE and Himalayan states | MIDH Operational Guidelines 2025, B.5; limit raised from 2,500 to 4,000 m2 by the MoA&FW letter of 12.08.2025 |
| 4,000 m2 and above | National Horticulture Board | fan and pad 1,400, tubular 844, bamboo 450, shade net 710/360; hilly rates for special-area states; at most Rs 56 lakh per project | NHB Cost Norms and Pattern of Assistance (A.2), same letter |

Assistance is 50% of the cost the scheme recognises: the build cost without irrigation (drip has its own scheme), limited to norm x area. For the Goa benchmark that is 50% of Rs 3,60,000 (1,200 x 300 m2) = Rs 1,80,000, not 50% of the whole Rs 4,95,338. The returns panel applies the user's subsidy percentage to the same base, so a state top-up can be modelled. A test (`src/test/subsidy-schemes.test.ts`) keeps the NHB figures equal to the CSV. The price model (`pricing.js`) is unchanged and still calibrated on the NHB ratios.

## Risk (Monte Carlo)

`POST /api/risk/simulate` (`routes/risk.js`) runs `services/risk/monteCarlo.js` on the calculation: 5,000 projects by default (bounded to 500-20,000), 1 to 15 years, about 50 ms. A seeded generator makes the same inputs give the same answer.

| Input | Varies how | Where the range comes from |
|---|---|---|
| Yield | triangular, new draw each year, centred on the user's figure | the crop's published trial range (planner estimate for lettuce and strawberry, flagged) |
| Price | log-normal, new draw each year, centred on the user's price | `priceSpread.js`: 60+ days of national daily medians when stored; otherwise the spread across 20+ markets on the latest day (tomato 0.29, capsicum 0.18, cucumber 0.47 on 2026-10-13); otherwise an assumed 0.30, flagged |
| Build cost | triangular, once per project | the cost model's own +/-10% band |
| Running cost share | triangular, once per project | +/-10 points: an assumption, flagged |
| Subsidy | follows the drawn build cost | `subsidySchemes.js` |

Output: P10/P50/P90 of net present value (10% discount by default), payback and yearly profit; the chance of a loss and of paying back within 3, 5 and N years; a histogram; and a one-at-a-time ranking of which input moves NPV most. The `sources` block tells the page which ranges are measured and which are assumed. Price spread across markets misses seasonal swings, so until the daily ingest has 60 days of history the page says the real risk is likely higher.

## Request validation

`validators/requestSchemas.js` (zod) checks what clients send to the routes that store data or reach the model: saved setups (known fields with sane types and sizes; unknown keys dropped; ids must be UUIDs), AI requests (the last 20 turns, each trimmed, ending on the user; language falls back to English; bad planning numbers are dropped, not fatal) and risk requests. The planner configuration itself keeps `configValidator.js`, whose field messages the UI shows. On the frontend, zod checks the AI sources trailer (only http/https links become clickable) and the risk response.

## The AI assistant (local models and retrieval)

`routes/ai.js` serves `/api/ai/status`, `/advisor`, `/crops` and `/chat`. The model runs in the server process: `services/llm/engine.js` loads GGUF weights with node-llama-cpp (`backend/.models`, installed by `npm run models:download`). No external API is called.

```
question -> [Hindi/Marathi: farming words swapped for English, then translated]
         -> services/rag: BM25 keywords + bge-m3 embeddings -> top candidates -> bge-reranker-v2-m3 -> best passages
         -> prompt = system (instructions + project facts, identical per project, kept warm by the model)
                   + user (numbered SOURCES, then the question)
         -> Qwen3 answers from the sources only, citing [n]
         -> the answer is followed by a trailer: the sources used, and any figure found in neither the sources nor the facts
```

| Piece | File | Notes |
|---|---|---|
| Passages | `services/rag/corpus.js` | Official documents (`datasets/knowledge`), the CSV datasets, the crop library, the pricing constants (generated from `pricing.js`, so they cannot drift) and `docs/`. Each passage carries its source, publisher, URL and status (current or older). |
| Search | `services/rag/retriever.js`, `index.js` | BM25 + embeddings fused by reciprocal rank with each ranker's top two guaranteed a place; compound questions are split and searched per part; a reranker orders the final pool. Falls back to keywords if the embedding model or reranker is missing or slow. |
| Embeddings cache | `services/rag/embeddingStore.js` | `backend/.data/rag-embeddings.json`, keyed by passage text, so the long part happens once. District climate passages are found by name and are not embedded. |
| Guard | `unverifiedFigures` in `routes/ai.js` | Lists figures in an answer that are in none of the passages the model saw nor the project facts. Small models do state figures they were not given. |

Measured on an Intel Core 7 150U laptop (15 W, no GPU), 8 threads: Qwen3-1.7B reads ~55 prompt tokens/s and writes ~13 tokens/s; Qwen3-4B ~30 and ~8.6. Ten threads was slower than eight. A repeated prompt start is skipped by the runtime (0.3 s instead of 18 s for 1,000 tokens), which is why the project facts come first and the per-question sources last. Retrieval plus reranking adds 5 to 8 seconds.

Measure any change to retrieval, prompts or the model with `cd backend && npm run eval:assistant` (real models, real routes; the report goes to `backend/.data/eval-*.txt`). Retrieval details that the eval showed matter: each passage is cut to the part that matches the question (`focusPassage`), not its first 650 characters; the planner's own crop pages are limited to one passage per answer so they cannot crowd out the crop guides; a short follow-up ("And gerbera?") is rewritten into a full question before searching; and a request for the instructions is answered without the model.

"What if" questions are answered by the planner (`services/whatIf.js`). A cheap word check spots them; the model then fills a JSON schema with the change (on the helper lane, so the chat's cached context survives), and that reading is checked against the question's own words (`groundExtraction`): an option counts only when the question names it (and is added when the model missed the only option named), a number only when it appears in the question, and a value equal to today's is dropped. The evaluation showed why: the 4B turned "switch to bamboo" into bamboo plus fan and pad, a flat roof and glass; `runCalculation` and `services/returns.js` (the same arithmetic as `src/lib/finance.ts`, kept equal by a test) produce the figures now and with the change; the prompt carries them as a PLANNER WHAT-IF block the model must quote, the figure guard treats them as known, and the trailer sends them to the chat, which shows them as a table. When the crop changes without a yield and price, profit and payback are deliberately not compared.

The default chat model is the 4B. On the 66-question set (`datasets/eval/assistant-questions.json`, regular-expression checks against the official figures) the 1.7B scored 56/66; the 4B fixed half of its failures, mainly by reading the right passage and keeping to the scope rules. Known limits: neither model always holds back general advice with numbers when no source covers a question, which is what the unverified-figures warning is for. The knowledge base has no official lettuce or NFT guide and no state subsidy rates other than Telangana's technical specification; `datasets/knowledge/manifest.json` lists these gaps and the assistant is told to say so.

## Authentication (Supabase Auth)

Sign-up, sign-in (email and Google), password reset and sessions are handled by Supabase Auth in the browser (`supabase-js`, PKCE). The backend has no login endpoints. `requireAuth` takes the Bearer access token, asks Supabase `GET /auth/v1/user` who it belongs to (cached 30 seconds, so it works with any signing key and respects sign-out), and finds or creates the `app_users` profile:

- linked by `auth_user_id` when seen before;
- otherwise an existing profile with the same email is adopted, but only when Supabase reports that email as confirmed, so nobody can claim someone else's saved setups by registering their address;
- otherwise a new profile is created.

Password-reset and confirmation emails are sent by Supabase. Configure Resend as Supabase's SMTP provider in the dashboard (Authentication > Emails > SMTP). Migration `20261013040000_supabase_auth.sql` adds `auth_user_id` and drops the password, Google id and reset-token storage.

Existing accounts: Google users sign in with Google and are matched by email; password users use "Forgot password" once, because Supabase cannot import the old scrypt hashes.
