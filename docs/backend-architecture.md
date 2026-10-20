# Backend architecture and calculation audit

Last audited: 2026-10-20. Rerun `node backend/scripts/auditCalculations.js` after changing a rate, a norm or a dataset.

## Request flow

```
Browser (React/Vite :8080)
  -> Express app (backend/app.js: request id, rate limit, CORS, JSON body)
     -> /api/farm/calculate        the poultry calculation (public, reads no account data)
     -> /api/risk/simulate         Monte Carlo on the calculation (public, rate limited)
     -> /api/auth, /api/configurations   (repositories -> Postgres; poultry setups only)
     -> /api/ai/*                  local models + retrieval; off until the models are installed
     -> /api/location, /api/health
```

`POST /api/farm/calculate` takes `{ config, assumptions, bankFinanced }` and does, in order:

1. `requestSchemas.poultryCalculateRequest` (zod) checks the body; bad planning numbers fall back to the defaults.
2. `normalizePoultryConfig` accepts the browser's field names and makes the choices a shed type forces: a controlled
   shed has closed tunnel walls, a backyard shed a bamboo or wood frame.
3. `validators/poultryValidator.js` checks ranges (`shared/poultry-limits.json`), the options, which shed a bird is
   kept in, and that the district belongs to the state.
4. `runPoultryCalculation` (`services/poultry/calculator.js`, pure functions, no I/O) computes the flock, the build
   cost and first batch, the NABARD comparison, the schemes, the siting rules, the climate and heat stress, a year's
   returns and the batch calendar.
5. `buildReference` (database) attaches the district climate card. It returns `null` if the database is down, so no
   figure depends on it.

## Layers

| Layer | Files | Rule |
|---|---|---|
| Routes | `routes/*.js` | HTTP only: parse, call a service, shape the response |
| Poultry services | `services/poultry/calculator.js`, `costModel.js`, `production.js`, `heatStress.js`, `services/flock.js` | Pure calculation, unit-tested without a server. `production.js` is the arithmetic of `src/lib/poultryFinance.ts` and `flock.js` of `src/lib/flock.ts`; tests keep each pair equal |
| What-if | `services/whatIf.js` | Turns a chat question's change into planner figures (see the AI section) |
| Reference services | `services/referenceData.js`, `services/climate.js` | District climate from Postgres (cached 10 minutes) and the state and district profiles |
| Risk | `services/risk/poultryRisk.js`, `monteCarlo.js` | Pure, seeded simulation over `production.js` |
| Data | `shared/poultry-norms.json`, `data/poultry/norms.js`, `schemes.js`, `siting.js`, `data/stateClimate.js`, `climateProfiles.json`, `rainfallProfiles.json` | Norms and prices with their sources, the scheme and siting rules, climate profiles generated from the NASA CSV |
| Validation | `validators/poultryValidator.js`, `validators/requestSchemas.js` | The setup keeps field-by-field rules (messages the UI shows); zod checks the request bodies |
| Repositories | `repositories/index.js` | All SQL for users and saved setups |
| Database | `config/db.js`, `supabase/migrations/*` | Supabase Postgres, shared with the polyhouse app; PGlite in-process for dev and tests |
| Scripts | `scripts/` | `loadReferenceData`, `auditCalculations`, `buildRainfallProfiles`, `downloadModels`, `evalAssistant` |

Dependency note: `backend/package.json` has an npm `overrides` entry pinning `simple-git` 4.0.2. `node-llama-cpp` 3.22
asks for `simple-git` ^3.36, whose dependency `@simple-git/argv-parser` < 2.0.1 has a critical advisory that fails the
CI audit; no patched 3.x exists. `node-llama-cpp` only uses it to build llama.cpp from source, and all eight methods it
calls exist in 4.x. Remove the override once `node-llama-cpp` depends on a patched version.

## Data in Supabase

The database is shared with the polyhouse app, so its tables stay. Saved setups carry `config_type = 'poultry'`, and
the upsert refuses to overwrite another app's row (the route answers 409).

| Table | Source | Used for |
|---|---|---|
| `app_users`, `saved_configurations` | the app | profiles (linked to Supabase Auth by `auth_user_id`) and saved setups (no public policies) |
| `district_climate_monthly`, `district_climate_unresolved` | NASA POWER | the district climate card |
| `poultry_unit_costs`, `poultry_production_norms`, `poultry_scheme_rules`, `poultry_siting_rules` | `datasets/csv` | the official poultry tables (migration `20261020020000_poultry_reference_data.sql`, not yet applied to the live project) |
| `cost_norms`, `midh_area_limits`, `mandi_prices_daily` | NHB, MIDH, Agmarknet | the polyhouse app; this app does not read them |

## The cost model

`services/poultry/costModel.js`, over `shared/poultry-norms.json` (every rate carries its source):

```
civil       = shed sq ft x shed rate x envelope factor
                shed rate: Rs 319/sq ft broiler, 275 layer (NABARD 2023-24), 50 backyard (NABARD indigenous model),
                           1,000 environment-controlled (secondary source, flagged)
                envelope factor: roof sheet + walls to the eaves + gable ends, against NABARD's open shed
                                 (2.1 m eaves, 3.5 m ridge, gable, 1.07 m overhang)
roof sheet  = roof area x (chosen sheet rate - GI rate)          the shed rate already includes a GI roof
side walls  = 2 x length x Rs 600/m for automatic curtains        (assumption, flagged)
entry       = footbath Rs 3,000 (+ a 60 sq ft anteroom at the shed rate)   (assumptions, flagged)
equipment   = birds x Rs 45 (broiler), 170 (cages), 15 (desi); 90 semi-auto, 150 automatic, 250 automatic cages (flagged)
layer units = feed store, fencing and water supply for each 5,000 birds (NABARD)
electrical  = 3% of the civil works (NABARD)
capital     = civil works + side walls + equipment + layer items + electrical; quoted as a band of +/- 10%
working capital (first batch) = chicks + feed + insurance (6% of chicks) + vaccines (+ 1.5 months of labour for layers)
project     = capital + working capital          compared with NABARD's unit cost for the same flock
```

The frame material, cage tiers and district do not change the price (NABARD's rate is per sq ft whatever holds the
roof up, cages are priced per bird, the district changes the climate advice); the response lists them in
`diagnostics.notPriced`, and every chosen item without a published price in `diagnostics.unsourcedRates`, which the
Cost tab shows as a warning.

## What the audit verified (2026-10-20)

A. **NABARD reproduction.** Given each NABARD 2023-24 unit's own inputs, the app reproduces its unit cost within 1.3%:

| Unit (Jharkhand 2023-24) | NABARD Rs | App Rs | Off |
|---|---|---|---|
| Broiler 1,000 | 5,94,000 | 6,00,239 | +1.1% |
| Broiler 500 | 3,00,000 | 3,00,120 | 0.0% |
| Broiler 250 | 1,52,000 | 1,50,078 | -1.3% |
| Layer in cages 1,000 | 6,42,000 | 6,42,870 | +0.1% |
| Layer in cages 2,000 | 12,84,000 | 12,85,740 | +0.1% |
| Layer in cages 5,000 | 32,10,000 | 32,14,350 | +0.1% |

`src/test/poultry-calculations.test.ts` holds every unit to +/- 10%.

B. **Heat stress** (temperature-humidity index above 30 in at least one month, open shed, NASA monthly means): every
district of Bihar, Chhattisgarh, Haryana, Jharkhand, Madhya Pradesh, Rajasthan, Telangana and Uttar Pradesh for
broilers; none in Assam, Kerala, Manipur, Mizoram, Nagaland, Sikkim or Tripura. Layers (weighted more to wet bulb)
are stressed in fewer districts.

C. **Inputs that move the price:** a monitor roof (+5.2% on the audit shed), a PUF roof (+24.4%), an anteroom (+1.5%)
and 3 m eaves (+8.0%); the frame, cage tiers and district do not, as intended.

## Open findings (need a decision or data)

1. **NABARD unit costs are for Jharkhand only.** Banks finance against their own state's unit cost; other states'
   rates differ and are not in the data.
2. **Unsourced rates:** the environment-controlled shed rate (secondary source), semi-automatic and automatic
   equipment, automatic curtains, the non-GI roof sheets, the footbath and the anteroom size. Each is flagged in the
   response and on the Cost tab.
3. **Prices are assumptions the farmer edits:** live broiler, egg, chick and feed prices change daily and no official
   daily series is stored. The egg default is a secondary NECC quote (July 2026).
4. **Heat stress uses monthly means,** so afternoons are hotter than the index: a flagged month is certainly
   stressful, and a month just below the line can still have hot afternoons.
5. **Rainfall is one typed number per state** until the IMD district normals are imported (see
   `datasets/README.md`; `node backend/scripts/buildRainfallProfiles.js`).
6. **State schemes are partly unverified:** the Maharashtra scheme rests on third-party summaries until its GR is
   found, and is marked unverified in the response and the knowledge base.

## Government schemes

`data/poultry/schemes.js` (`computeSchemes`) decides which schemes a project can use; every calculation carries the
result, and the Schemes card, the loan step, the PDF and Excel exports, the AI's project facts and the risk model all
read it.

| Scheme | What it gives | For |
|---|---|---|
| NLM-EDP (rural poultry) | 50% back-ended capital subsidy, capped at Rs 25 lakh, at least 10% own share | a rural poultry parent farm (1,000 parent females and 100 males) with hatchery and brooder-mother unit; not a plain broiler or layer farm |
| AHIDF | 3% interest subvention on a loan of up to 90% of cost, 8 years with 2 of moratorium | feed plants and meat processing, not the farm |
| State schemes | as notified | marked unverified until the official order is found |

When no scheme applies (the usual case for a commercial broiler or layer farm), `schemes.noneApplies` is true, the
screens say so, and the bank loan carries the project (`src/lib/loan.ts`, up to 90% of cost).

## Risk (Monte Carlo)

`POST /api/risk/simulate` (`routes/risk.js`, body `{ config, assumptions, risk: { outbreakChancePct }, options }`) runs
`services/risk/poultryRisk.js`: thousands of years, seeded, each drawing mortality (0.6 to 2.4 times the planned
rate), feed conversion (0.15 better to 0.2 worse), the sale price (log-normal), the feed price (+/- 10%) and the build
cost (+/- 10%), with a yearly chance of an outbreak that loses a batch (2% by default; no official rate exists). Every
simulated year goes through `production.js`, so the median matches the Earnings step. None of the ranges has an
official source yet; each travels with the result as a labelled assumption.

## Request validation

`validators/requestSchemas.js` (zod) checks what clients send: saved setups (known fields with sane types and sizes;
unknown keys dropped; ids must be UUIDs), calculation and risk bodies (`poultryCalculateRequest`, `poultryRiskRequest`,
`poultryAssumptions`) and AI requests (the last 20 turns, each trimmed, ending on the user; language falls back to
English; bad planning numbers are dropped, not fatal). On the frontend, zod checks the AI sources trailer (only
http/https links become clickable) and the risk response.

## The AI assistant (local models and retrieval)

`routes/ai.js` serves `/api/ai/status`, `/advisor` and `/chat`. The model runs in the server process:
`services/llm/engine.js` loads GGUF weights with node-llama-cpp (`backend/.models`, installed by
`npm run models:download`; `LLM_MODELS_DIR` points elsewhere). No external API is called.

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
| Passages | `services/rag/corpus.js` | Official documents (`datasets/knowledge`: NLM-EDP, AHIDF, NABARD and NCDC projects, CPCB, DAHD biosecurity, TNAU and Vikaspedia guides), the CSV tables, the planner's norms, prices, schemes, siting rules and cost items (generated from the code and `shared/poultry-norms.json`, so they cannot drift) and `docs/`. Each passage carries its source, publisher, URL and status (current, older or unverified). |
| Search | `services/rag/retriever.js`, `index.js` | BM25 + embeddings fused by reciprocal rank with each ranker's top two guaranteed a place; compound questions are split and searched per part; a reranker orders the final pool. Falls back to keywords if the embedding model or reranker is missing or slow. |
| Embeddings cache | `services/rag/embeddingStore.js` | `backend/.data/rag-embeddings.json`, keyed by passage text, so the long part happens once. District climate passages are found by name and are not embedded. |
| Guard | `unverifiedFigures` in `routes/ai.js` | Lists figures in an answer that are in none of the passages the model saw nor the project facts. Small models do state figures they were not given. |

The rules the model is given: answer from the SOURCES and the PROJECT FACTS only; never invent subsidy amounts,
eligibility, prices, doses or production figures; take subsidies only from the schemes in the project facts (never
work one out as a share of the cost), and say plainly when no scheme applies; give vaccines and medicines only as the
sources write them, with a note that a veterinarian's advice must be followed; and stay within poultry farming.

Measured on an Intel Core 7 150U laptop (15 W, no GPU), 8 threads: Qwen3-1.7B reads ~55 prompt tokens/s and writes ~13
tokens/s; Qwen3-4B ~30 and ~8.6. Ten threads was slower than eight. A repeated prompt start is skipped by the runtime
(0.3 s instead of 18 s for 1,000 tokens), which is why the project facts come first and the per-question sources last.
Retrieval plus reranking adds 5 to 8 seconds.

Measure any change to retrieval, prompts or the model with `cd backend && npm run eval:assistant` (real models, real
routes; the report goes to `backend/.data/eval-*.txt`). Retrieval details that the eval showed matter: each passage is
cut to the part that matches the question (`focusPassage`); the planner's own pages are limited to one passage per
answer so they cannot crowd out the guides; a short follow-up is rewritten into a full question before searching; and a
request for the instructions is answered without the model.

"What if" questions are answered by the planner (`services/whatIf.js`). A cheap word check spots them; the model then
fills a JSON schema with the change (flock size, shed size, bird, shed type, contract or independent, roof, sheet,
feeding, state, prices and mortality) on the helper lane, so the chat's cached context survives, and that reading is
checked against the question's own words (`groundExtraction`): an option counts only when the question names it, a
number only when it appears in the question, and a value equal to today's is dropped. `runPoultryCalculation` produces
the figures now and with the change; the prompt carries them as a PLANNER WHAT-IF block the model must quote, the
figure guard treats them as known, and the chat shows them as a table.

## Authentication (Supabase Auth)

Sign-up, sign-in (email and Google), password reset and sessions are handled by Supabase Auth in the browser
(`supabase-js`, PKCE). The backend has no login endpoints. `requireAuth` takes the Bearer access token, asks Supabase
`GET /auth/v1/user` who it belongs to (cached 30 seconds, so it works with any signing key and respects sign-out), and
finds or creates the `app_users` profile:

- linked by `auth_user_id` when seen before;
- otherwise an existing profile with the same email is adopted, but only when Supabase reports that email as
  confirmed, so nobody can claim someone else's saved setups by registering their address;
- otherwise a new profile is created.

Password-reset and confirmation emails are sent by Supabase. Configure Resend as Supabase's SMTP provider in the
dashboard (Authentication > Emails > SMTP).
