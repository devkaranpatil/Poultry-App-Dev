# Project status and roadmap

Last updated: 2026-10-17. Greenhouse IQ is a working prototype: every feature below runs end to end on a laptop, against the real Supabase database, with the AI on local open-source models.

## What runs where

| Service | Where | Start | Notes |
|---|---|---|---|
| Frontend (React, Vite, Three.js) | http://localhost:8080 | `npm run dev` | designer, 3D view, results, returns and risk, AI, saved setups, exports, en/hi/mr |
| Backend API (Express) | http://localhost:5000 | `cd backend && npm run dev` | calculations, subsidy, risk, saved setups, AI routes, reference data |
| AI assistant | inside the backend process | models: `cd backend && npm run models:download` | Qwen3-4B (chat), bge-m3 (search), bge-reranker-v2-m3; CPU only; about 3 GB RAM |
| Database and login | Supabase (hosted) | nothing to start | Postgres (profiles, saved setups, official tables, mandi prices) and Supabase Auth (email and Google) |
| Mandi price ingest | `backend/scripts/ingestMandiPrices.js` | daily GitHub workflow | needs the `DATABASE_URL` and `DATA_GOV_IN_API_KEY` repository secrets; has run once (2026-10-13) |

## Work done

### Planner foundation (initial commit, 2026-10-13)

- Setup forms with validation (`shared/greenhouse-limits.json`, district must belong to its state) and a 3D model that follows every option: roof, materials, ventilation, doors, six crops and four irrigation systems, with quality levels and mobile layout (`docs/3d-scene.md`).
- Cost model per m2 of floor area with a climate surcharge, calibrated on the NHB cost norms; crop suggestions per climate group; climate advisories.
- Official data in Postgres: NHB cost norms, MIDH area limits, NASA POWER district climate (540 districts), daily Agmarknet mandi prices.
- Supabase Auth (email, Google, password reset), saved setups, comparison, share links, PDF and Excel export, Hindi and Marathi.

### Calculation audit (2026-10-13)

- `backend/scripts/auditCalculations.js` checks volumes, cost reconciliation and which inputs move the price; findings and decisions are in `docs/backend-architecture.md`.
- Evidence-based fixes: shade-net and fan-and-pad rates from the official ratios, heat surcharge on the district's hottest month, crop yields from three published papers with links.
- Security: migration that revokes the `rls_auto_enable` function from public roles (Supabase advisor finding).

### Local AI assistant with retrieval (2026-10-14)

- Replaced the Gemini API with open-source models running in the backend (`node-llama-cpp`): no API key, nothing leaves the server.
- Retrieval over 22 sources (about 1,300 passages): MIDH Operational Guidelines 2025, NHB norms, NCERT protected-cultivation textbook, TNAU crop guides and IPM schedule, the CSV datasets, the planner's own cost model. Keyword search plus multilingual embeddings, then a reranker.
- Answers cite numbered sources with links; a guard lists any figure that is in neither the sources nor the project's numbers.
- Hindi and Marathi questions: farming words swapped for English, then translated before searching.
- Prompt layout tuned for a slow CPU (the project facts stay cached between questions).

### Assistant evaluation and fixes (2026-10-14)

- `datasets/eval/assistant-questions.json`: 66 questions with answers checked against the official files (costs and subsidy, crops and pests, the project's own numbers, Hindi and Marathi, edge cases such as off-topic, prompt injection, false premises, typos, follow-ups, and request validation). Run with `cd backend && npm run eval:assistant`.
- Fixes it led to:
  - PDF text was decoded with the wrong encoding (330 dashes, bullets and degree signs became "�"): `fetch_knowledge.py` now asks `pdftotext` for UTF-8.
  - Long passages were cut at 650 characters, hiding the answer (whitefly advice after a leaf-miner section): passages are now cut around the sentences that match the question.
  - The planner's own crop pages crowded out the crop guides: limited to one per answer.
  - Short follow-ups ("And gerbera?") are rewritten into full questions before searching.
  - Off-topic questions are declined; requests for the instructions get a fixed reply without the model.
  - The answer language is repeated next to each question.
  - The figure guard now catches amounts with a unit ("50 kg per plant") whose bare number appears elsewhere.
- Result on the Qwen3-1.7B model: 50/66 before, 56/66 after. The 4B fixed 5 of the 10 remaining failures, so it is now the default (slower: about 50 to 90 s per answer on a laptop).
- The evaluation also found that two subsidy schemes are current at once (NHB Rs 1,400 per m2 for fan and pad, MIDH 2025 Rs 1,800), which led to the next item.

### Latest subsidy schemes (2026-10-14)

- `backend/data/subsidySchemes.js`: MIDH Operational Guidelines 2025 slab norms through the state mission under 4,000 m2; NHB norms and the Rs 56 lakh cap from 4,000 m2 (MoA&FW letter of 12.08.2025); 15% higher norms in NE and Himalayan states.
- The subsidy is now 50% of the cost the scheme recognises (build cost without irrigation, limited to norm x area), not 50% of the whole cost. Goa benchmark: Rs 1,80,000 instead of about Rs 2,47,000. Build prices are unchanged.
- The reference card, returns, PDF, Excel and the AI's project facts all read the same result.

### Request validation with zod (2026-10-14)

- `backend/validators/requestSchemas.js`: saved setups (previously any JSON was stored), configuration ids, AI requests and risk requests.
- Frontend: the AI sources list is validated and only http/https links become clickable; the risk response is validated before it is shown.

### Monte Carlo risk (2026-10-14)

- `POST /api/risk/simulate` and the Risk card in the Returns tab: thousands of simulated projects over 5, 10 or 15 years, varying yield (published ranges), price (spread across today's mandis, or history once stored), build cost (the model's band) and running cost (stated assumption).
- Shows P10/P50/P90 net present value, the chance of a loss, the chance of paying back within 3 and 5 years, a histogram and which input moves the result most, and says which ranges are measured and which are assumed. Seeded, about 50 ms per run.

### Sourced crop defaults and "what if" answers (2026-10-14)

- Every crop's default yield and price now carries its source, shown under the returns assumptions: tomato 8.75 kg/m2 a year (TNAU hybrids 80-95 t/ha), capsicum 9 (Vikaspedia 80-100 t/ha per 7-10 month crop), cucumber 12 (ICAR: three 40 t/ha crops; was 25, above any published figure), strawberry 2.25 (AAU), gerbera 226 stems (Junagadh trial mean); lettuce and three prices are labelled assumptions. Tomato, capsicum and cucumber prices are the Agmarknet national median of 13 Oct 2026, and a button applies the latest mandi price for the project's state.
- "What if" questions in the chat (size, structure, material, crop, irrigation, state, yield, price, subsidy, running cost) are answered by the planner: the model only reads which change is asked (a JSON schema on the helper lane), that reading is checked against the question's own words so invented changes are dropped, the calculator and `services/returns.js` (equal to `finance.ts`, tested) produce the figures now and with the change, the model is told to quote them, and the chat shows them as a table.
- The evaluation set grew from 66 to 91 questions: what-if figures, the 2025 subsidy schemes, more crop facts from the sources, and edge cases.

### Clean-up (2026-10-14)

- Removed unused files: a one-off rename script, four unused frontend files, an unused data file.
- Coverage configuration lists only files that exist; a React hook warning fixed; `three-stdlib` declared as a direct dependency.
- The evaluation runner moved from a scratch script into `backend/scripts/evalAssistant.js`.
- `.gitignore` covers AI coding-assistant files (`CLAUDE.md`, `.claude/` and others), test output, all `.env` variants, the dataset download cache and `bun.lockb` (the project uses npm).
- CI dependency audit: `node-llama-cpp` pulled in `simple-git` 3.36 with a critical advisory (GHSA-v5rq-49vh-5v5c, via `@simple-git/argv-parser`). `backend/package.json` pins the patched `simple-git` 4.0.2 with an npm `overrides` entry; `node-llama-cpp` uses it only to build llama.cpp from source, and every call it makes exists in 4.x.

### CI repair and bank-ready finance (2026-10-17)

- **CI e2e was failing in headless Chromium**, which CI uses (local runs used real Chrome with a GPU, so they passed). Headless Chromium and GitHub runners draw WebGL on the CPU (SwiftShader); the scene picked "high" quality and redrew every frame, which blocked the page (clicks and mouse moves timed out). `src/lib/renderCapability.ts` now detects software WebGL: the scene then starts in "lite", draws on demand at about 6 frames a second, and on Auto renders at half resolution. Low-end PCs without a GPU driver get the same relief.
- **The exhaustive 3D sweep** (`e2e/scene-options.spec.ts`, tagged `@scene`) needs far more than the 25-minute e2e job on a CPU renderer. It moved to its own workflow, `.github/workflows/scene-e2e.yml` (when the 3D code changes, weekly, and on demand, 90 minutes). `npm run test:e2e` runs the 41 journey tests; `npm run test:e2e:scene` runs the sweep.
- **Mandi prices workflow** no longer fails every night while its two secrets are missing: it reports a notice and skips. With the secrets set, any failure still turns it red.
- **Blocked browser storage crashed the whole app**: the language setting read `localStorage` without a guard (Safari private mode, site data turned off). Guarded there, in the render-quality setting and in the recent setups list.
- **Bank loan** (`src/lib/loan.ts`, Loan & subsidy tab, PDF and Excel): loan share, interest, tenure, moratorium and instalment frequency; the margin, instalment, total interest, a full repayment schedule and the yearly farm cash, loan payments and debt cover (DSCR). The subsidy follows the NHB rule: held in a Subsidy Reserve Fund Account and adjusted against the last instalments, capped at the loan. Defaults are sourced: loan up to 80% and up to 7 years with a 3-12 month moratorium (Central Bank of India poly house scheme); 11.05% interest (Canara Bank agriculture term loans, one-year MCLR 8.75% + 2.30%, 18.08.2026). Monthly instalments and farm income starting after the moratorium are labelled assumptions. The Excel sheet uses live formulas (PMT and the reserve rule) that match the app's schedule.
- **How to claim the subsidy** (`src/lib/subsidyChecklist.ts`, Loan & subsidy tab): the NHB steps from 4,000 m² (land title or a 10-year lease, DPR, detailed loan sanction, IPA application and its fee by project cost, documents, 18-month completion, joint inspection, reserve account), the MIDH steps below it (district office, BIS materials, norm), and Telangana's own rules from its guidelines. Ticks are kept in the browser. English, Hindi and Marathi.

### A guided, beginner-friendly workspace (2026-10-17)

The workspace was split into "Design" and "Results", and Results was a menu of seven sections with no order and no explanations. Someone new could not tell where to start, what a term like DSCR meant, or how to read the Monte Carlo figures. The layout and wording changed; no calculation did.

- **One journey of seven steps** along the top: Design, Site, Cost, Earnings, Loan & subsidy, Risk, Report (`src/components/workspace/`).
  - The step bar numbers each step, ticks the ones you have opened and dims the money steps until the design is complete. On a phone it scrolls sideways.
  - **Every step page has the same shape:**
    - "Step n of 7" and the question the step answers;
    - an **In short** box that says the result in a sentence built from your own figures (for example "In a normal year you would sell Tomato worth about ₹66,938 and keep about ₹40,163 after running costs");
    - the key figures, then the detail;
    - **Back** and **Next** buttons.
  - Opening a money step too early says what is still missing, with a button back to Design.
  - When the design is complete, the setup panel shows "Your design is complete" and a **Next: Site** button.
- **Hard words explained in place.** A small "?" beside a term opens a plain explanation (`Explain.tsx`). It covers subsidy, your cost after subsidy, payback, ROI, debt cover (DSCR), instalment, moratorium, margin, gutter, ridge, yield, running cost, mandi, the risk simulation and today's-money value. Each section of the setup panel also opens with one sentence on what it decides.
- **Detail folded away.** Under "Show details" (`MoreDetails.tsx`): the loan's yearly table, ROI and sources on Earnings, the risk statistics, and the cost range. Beginners see the answer; advanced users are one click from the full numbers.
- **Risk rewritten.**
  - **No button press:** it runs by itself and reruns when an input or the horizon changes.
  - **The headline** is the chance of getting your money back within 5, 10 or 15 years: one big percentage, a two-colour bar and a verdict (good, mixed or poor odds). It uses the same undiscounted payback as the Earnings step, so the two steps agree.
  - **Outcomes:** three cards ("if things go badly", "typical result", "if things go well") show what the project is worth in today's money.
  - **What matters most:** one sentence names the input that moves the result most, with what to do about it.
  - **Statistics:** P10/P50/P90, the histogram, the chance of a loss and the sources sit under the details. The hook moved to `src/hooks/useRiskSimulation.ts`.
- **Earnings and Loan.**
  - **Earnings:** opens with "You pay", sales and profit a year, and payback. The year-by-year chart gets one line on how to read it, and the editable figures are titled "Your numbers".
  - **Loan:** shows the loan, your margin, the instalment and the debt cover first. Then a plain sentence on how the subsidy repays the loan, the warning when the farm cannot pay, the loan terms, and the yearly table under the details.
- **AI advisor beside every step.** "Ask the advisor" in the top bar opens it in a side panel (`AssistantSheet.tsx`) over whatever step you are on. Its example questions fit that step: on Loan, "What does debt cover (DSCR) mean for my loan?". The separate AI tab is gone.
- **First-visit guide** (`WelcomeGuide.tsx`):
  - It explains the app in five lines and offers "Start with a recommended greenhouse" or "I'll set it up myself".
  - It opens once per browser (`greenhouse.guideSeen`), and the "?" in the top bar opens it again.
- **Landing page** in plain words ("Know what a greenhouse will cost and earn, before you build"). Its "How it works" now matches the steps, and the closing button is readable on the green band.
- **Wording** in English, Hindi and Marathi: about 140 new labels per language, plus a few Marathi labels that were missing before.
- **`RightPanel.tsx` was removed.** Its cost and site views live in `StepViews.tsx`.

**Tested as different users** (`e2e/personas.spec.ts`, plus a phone journey in `e2e/mobile.spec.ts`). These are scripted journeys through the real app, not sessions with real people:
- **First-time grower:**
  - The guide, the recommended start and the location, then "Your design is complete".
  - Next through every step, checking each plain summary; a "?" explanation; the risk odds.
  - The PDF download, and a question to the advisor (stubbed in the browser) with its source.
- **Grower comparing options:** opens a money step too early and is sent back to Design. Edits the yield and sees the summary change, resets it, then switches the crop to capsicum and sees Earnings follow.
- **Advanced user:**
  - A 10-year quarterly loan with the full yearly table.
  - The risk over 15 years with its statistics.
  - The Excel download, then the same steps in Hindi.
- **Phone user:** the guide, then Next through the steps, then the advisor; nothing overflows the screen.

### 3D model rebuilt, direct editing, AI summary step and advisor window (2026-10-19)

- **Models from reference photos.** `docs/3d-model-references.md` records what real Indian polyhouses, net houses and fittings look like, and the scene follows it.
  - Spans near 8 m and bays near 4 m, with instanced columns, hoops, trusses, purlins, gutters and bracing (`structureLayout.ts`, `FrameModel.tsx`).
  - An overlapping ridge vent with insect net on naturally ventilated houses. Hand-crank or motorised roll-up side curtains with insect net behind, or louvres (`VentsModel.tsx`).
  - Door models, including the double-door antechamber (`DoorModel.tsx`).
  - Fan-and-pad walls, circulation fans, a screen and the controller on climate-controlled houses (`ClimateEquipment.tsx`).
  - Shade-net houses with posts, a cable grid and guy wires (`CoverModel.tsx`).
  - Crops as grown: tomato and cucumber on strings from a high wire with hooks, capsicum on stakes, strawberry fruit on trusses over the bed edge.
- **Edited by touching the model, like Blender.**
  - Click a part on the model, or open its tab in the design sidebar (see below). Grips appear for that part.
  - Drag them to change length, width (or both at the corner), gutter or ridge height, with mouse or touch. Values snap and stay within the limits the server checks.
  - The panel shows the same values for typing, and the part's options as picture cards (`OptionThumb.tsx`).
  - Undo and redo (Ctrl+Z, Ctrl+Shift+Z) cover drags, the panel and the setup form, with one step per drag (`editHistory.ts`, `useEditHistory.ts`).
  - The view has a View/Edit switch, a navigation gizmo (`ViewGizmo.tsx`), numpad-style views, frame-selected (F) and a shortcut sheet (`viewportKeys.ts`).
- **Transitions.** Parts fade and grow in when the build reaches them. A changed option swaps with a short cross-fade, and size changes ease (`transitions.tsx`). All of this is off when the system asks for reduced motion.
- **AI summary is its own optional step, just before Report.**
  - A switch decides whether it goes into the PDF and Excel.
  - A summary made for other figures is marked out of date and left out of the report. That now covers the finance assumptions and the language too, not only the design.
- **The advisor is a chat window** (`src/components/advisor/`).
  - An "Ask the advisor" button sits at the bottom right. It opens a small window, or a sheet on phones, and can expand to full screen and back without losing the conversation. This replaces the top-bar side panel described above.
  - Step pages leave room at the bottom so the button never covers Back or Next.
- **Fixes found while reviewing this work:**
  - Leaving the Design step and coming back reset the setup progress, so the 3D model fell back to bare ground. The form's progress is now kept by the page.
  - Shadows, fog, the ground grid and how far you can zoom out now grow with the house, so a 200 × 100 m house keeps its shadows and the default camera position is no longer pulled in.
  - An undo that changed nothing could hide a later edit from the undo history.
- **Second round, after a visual check against the reference photos:**
  - **Crops appear without a location.** The model built crops and irrigation only after a state and district were chosen, so "Use recommended" showed an empty house. The location only feeds the money steps; the model now waits only for the crop and irrigation.
  - **Blender's G and S keys** (`src/lib/modalTransform.ts`). With a part selected, G grabs a size and S scales the house.
    - X, Y or Z locks the change to width, length or height.
    - Moving the pointer or typing a number changes the size live, with the same snapping and limits as a drag.
    - Enter or a click keeps the change and Esc or a right click cancels it. A kept change is one undo step.
  - **Fewer stray shapes.** A pale dome over the roof was low clouds seen from high views; the clouds now sit further out and fade as the camera climbs. A thin line out into the field was the film profiles, built twice the house length.
  - **Labels and guides.** The floating 3D labels are gone, since the Properties panel says the same. Size guides show only for the selected part.
  - **Materials closer to the photos.**
    - A fine, even insect net.
    - Clear glass with aluminium glazing bars.
    - Milkier film.
    - Black drip laterals on the mulch.
    - Low, soft grass.
    - Thin parts that stay solid at low quality, with antialiasing wherever the GPU allows.
  - **Phones.**
    - The Properties panel shrinks to a slim bar so the drag handles stay visible.
    - The parts row scrolls sideways.
    - Picking a part with handles frames it.
    - A tap may move a little and still count as a tap.
  - **Door and camera.** The length handle moved off the door end. The door view now looks at the entry from outside.
- **One design sidebar** (`DesignSidebar.tsx`), after feedback that the floating panels moved about and the setup form looked cluttered.
  - The setup form (`LeftPanel.tsx`, removed) and the floating parts panel are merged into one panel. On a desktop it is docked at the right of the model, like Blender's properties editor, and never floats, collapses or moves.
  - Ten tabs: Size, House type, Roof, Frame, Cover, Vents, Door, Crop, Irrigation, Location. Each gets a tick once set, and each has a one-line explanation.
  - Picking a part on the model opens its tab, and opening a tab selects that part on the model, so its handles appear.
  - "Use recommended" fills everything but the location, then opens the Location tab.
  - On a phone the same sidebar is the Setup view. The 3D view keeps the slim sheet for the selected part.
  - The advisor button moves left on the Design step so it never covers the sidebar.
- **Landscapes and skies around the house** (`src/lib/sceneEnvironment.ts`, `scene/SceneEnvironment.tsx`, `scene/EnvironmentBackdrop.tsx`, `scene/environmentLooks.ts`, `scene/environmentGeometry.ts`).
  - Six landscapes:
    - Plains: field patchwork and mango trees.
    - Deccan plateau: red soil and flat-topped basalt hills.
    - Coastal: coconut palms and paddy.
    - Desert: dunes and khejri.
    - Green hills: tea rows and mist.
    - Himalaya: pines, terraces and snow peaks.
  - Four skies: clear day, golden hour, monsoon overcast and night (moon, stars and fireflies).
  - Each location gets its own landscape: every state has one, and 25 districts that differ from their state have their own (the Konkan coast, coastal Karnataka, the Nilgiris, Darjeeling, Rayalaseema, South Gujarat and others). A test checks that every state and district is covered.
  - A picker at the top left of the 3D view changes the landscape and sky. "Auto" follows the location. Picks are kept in the browser.
  - Trees and hills keep clear of the house and of the preset camera views. Lite quality draws about 30% of the trees, with no sky dome, stars or shadows.
  - The 3D view no longer follows the dark UI theme; the sky choice sets the mood.
  - The advisor window no longer sets a `ref` on its animated element. framer-motion 12 reads `child.props.ref`, which made React 18 print a warning.

## How it is verified

| Check | Command | Last result |
|---|---|---|
| Unit and integration tests | `npm test` | 518 passed (2026-10-19) |
| Lint and types | `npm run lint`, `npm run typecheck` | no errors in the source |
| Production build | `npm run build` | passes |
| Dependency audit (CI, blocking) | `npm audit --omit=dev --audit-level=high --prefix backend` | 0 vulnerabilities after pinning `simple-git` 4.0.2 (see below) |
| Browser tests | `CI=true npm run test:e2e` | 46 passed, 2 skipped, in about 5.6 min in headless Chromium, as CI runs it (2026-10-19). New: the landscape picker follows the location and keeps a picked landscape and sky after a reload. Earlier: New tests: the G and S keys, and crops without a location. The editor tests were rewritten for select-then-drag editing. The phone journey had been flaky: its scroll calls raced a results refresh. Once those calls were removed it passed 5 of 5 runs |
| 3D sweep | `CI=true npm run test:e2e:scene` | 10 tests in about 20 min on a laptop CPU (2026-10-19): all pass after the cover test was updated to the new film mesh (`roof-cover-film`) and to woven nets, whose see-through comes from their weave. The irrigation test failed once on timing and passed when rerun. The full sweep runs in its own workflow |
| Assistant evaluation | `cd backend && npm run eval:assistant` | 56/66 on the 1.7B (first 66 questions). The 25 new questions on the 4B: 19/25 (what-if 7/8, project 2/2, edge 3/3, facts 7/12); the full 91 have not yet been run on the 4B in one go |
| Retrieval check (no chat model) | see `docs/backend-architecture.md` | 46/51 fact questions have their answer in the passages the model reads |
| Calculation audit | `node backend/scripts/auditCalculations.js` | Goa benchmark unchanged at Rs 4,95,338 |

## Known limits

- **Crop prices are thin.** Tomato, capsicum and cucumber defaults are one day's national mandi median (13 Oct 2026); the returns panel offers the latest mandi price, but there is no seasonal average yet. Lettuce, strawberry and gerbera prices, and the lettuce yield, are labelled assumptions.
- **Price risk is understated** until the daily ingest has run for about 60 days: today's spread across markets misses seasonal swings. Gerbera, strawberry and lettuce have no mandi data and use an assumed spread.
- **AI speed and accuracy.** 50-90 s per answer on a laptop CPU; even the 4B sometimes adds general advice with numbers when no source covers a question (the unverified-figures warning flags those).
- **Unsourced rates.** Irrigation, ventilation, foundation, labour and miscellaneous rates, aluminium and glass have no official price; the heat surcharge threshold is the app's choice.
- **Rainfall** is one number per state until the IMD district file is imported (the import script exists).
- **Knowledge gaps.** No official lettuce or NFT guide; no state top-up rates; the 2,500-4,000 m2 subsidy rate is not published.
- **PDF reports are English only** (jsPDF cannot render Devanagari).

## Roadmap

### Now: make what exists dependable

1. Commit the current work; run the full 91-question evaluation on the 4B.
2. A signed-in walk-through: chat, advisor review, save and load, exports, risk.
3. Turn on the daily mandi ingest (two GitHub secrets).

### Next: correct inputs, because every output depends on them

1. **Seasonal crop prices**: a yearly average per crop once the mandi history exists, replacing the one-day default; official prices for gerbera, strawberry and lettuce.
2. **Risk into the AI advisor**, so its review quotes the chance of a loss and the main driver.
3. **Gaps the 4B evaluation found**: crop durations (tomato, cucumber) and capsicum bed size are in the sources but not retrieved; the model misread a MIDH slab (Rs 1,600 for 1,008-2,500 m2, which is Rs 1,500), left out the 15% NE uplift, and once quoted the "now" figures of a what-if instead of the changed ones (the table under the answer is right).
4. **Seasonal price model** once 60+ days of mandi history exist (the risk model switches to history automatically; next: by month).
5. **IMD district rainfall import** (script ready; the file needs a browser download).
6. **State top-ups** to the MIDH 2025 norms for the main horticulture states, from state mission notifications.

### Then: decide where it runs

- The AI needs about 4 GB of RAM and is slow on a small CPU server. Options: a CPU server with 8+ cores, a small GPU server (answers in seconds), or launching the planner first and adding the AI later.
- Production checklist: environment variables, Resend as Supabase's SMTP provider, leaked-password protection in Supabase, error monitoring, backups.

### Feature ideas (later)

| Feature | Why | Effort |
|---|---|---|
| Vendor quote check: compare builders' quotes line by line with the NHB norm and the cost model | farmers are often overcharged; no other tool does it | medium |
| Crop calendar and planting window per district | uses the district climate already loaded | medium |
| "What if" questions answered by recalculating (AI calls the planner) | numbers come from the model, not the language model | medium; needs testing on the 4B |
| Answer cache for common questions | cuts the 50-90 s wait for repeat questions | small |
| More crops with sources (lettuce/NFT, carnation, chilli) | wider use | medium (finding official sources) |
| Multi-structure projects (several houses on one farm) | real farms build in phases | medium |
| Offline use (PWA) for field visits | patchy connectivity in rural areas | medium |
| Voice input in Hindi and Marathi | ease of use | large on a CPU |
| Disease diagnosis from a photo | high value for growers | large; needs a vision model and a GPU |
