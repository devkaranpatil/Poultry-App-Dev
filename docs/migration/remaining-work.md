# What is left after the migration

The plan in [implementation-plan.md](implementation-plan.md) is done to the end of Phase 7, except the items below.
Each says what to do, why it was left, and how to check it.

## 1. Run the AI assistant evaluation to the end

**Status:** stopped part-way on 2026-10-20 at the user's request. The laptop ran low on memory: a first run kept going in
the background after it was reported stopped, so two runs (two copies of the models) shared the 17 GB, and answers
slowed from about 45 s to several minutes each.

**How to run it** (close browsers and other heavy programs first; one run at a time):

```
cd backend
LLM_MODELS_DIR=<folder with the .gguf files> npm run eval:assistant
```

The models are already downloaded in the polyhouse repo (`Polyhouse-App-Dev-master/backend/.models`), so
`LLM_MODELS_DIR` can point there instead of downloading them again. The embeddings for the 1,026 passages are cached in
`backend/.data/rag-embeddings.json`, so the run starts answering straight away. 85 questions take about 1 to 1.5 hours.
Afterwards, record the score in `docs/project-status.md` (AI section) and in the assistant-findings memory.

To run only some questions: `npm run eval:assistant -- --only=id1,id2`.

**Partial result (Qwen3-4B, 67 of 85 questions answered): 50 passed.**

| Kind | Passed | Not reached |
|---|---|---|
| fact | 29 / 38 | |
| project | 10 / 12 | |
| what-if | 5 / 11 | |
| edge | 6 / 6 answered | 9 not reached |
| language | | 4 not reached |
| http | | 5 not reached |

Two of the fact failures (`litter-start`, `litter-max`) were the test's fault: the answer was right ("3” to 5”") but the
pattern did not allow an inch mark. The patterns are fixed. `brooding-reduce` may have been the same; its pattern now
also accepts "5°".

## 2. Fix what the evaluation found

Real faults in the answers, most important first:

1. **What-if answers quote the wrong column.** For "on contract", "a PUF roof" and "an environment-controlled shed" the
   model listed the project's current figures as if they were the result (for example profit Rs 6,939 and payback
   81.7 years for contract, where the planner says Rs 23,495 and 16.9 years). The PLANNER WHAT-IF block in
   `services/whatIf.js` (`scenarioBlock`) puts "now" before "with the change" on each line. Try one line per column
   ("With the change: birds 1,054, build cost ...", then "Now: ...") or a table the model can copy, and rerun
   `--only=whatif-contract,whatif-puf,whatif-controlled,whatif-5000,whatif-price-110`.
2. **An impossible change gets no limit.** "10 km long" was answered with general advice, not "the length must be
   between 2 and 150 m". Check whether the extraction gave `lengthM: 10000` (then `planScenario` returns the error
   block); if it did not, `groundExtraction` may be dropping the number because the question says "10 km", not metres.
3. **Project total quoted the wrong figure.** "Total project cost including the first batch" was answered with the
   NABARD norm (Rs 6,26,076) instead of the project cost (Rs 5,66,774). The project facts name them `project` and
   `nabardNormForThisFlock`; clearer names (`projectCostWithFirstBatch`) may help. Working capital failed the same way.
4. **Vaccine ages come from the layer schedule.** IBD for broilers was answered "16 weeks" (a layer age); RD F1 and
   LaSota failed similarly. Retrieval should prefer `tnau-broiler-management` for broiler questions: tag its passages
   `bird: broiler` and let the bird in the question favour them, or split the TNAU disease page's layer schedule into
   its own section.
5. **Quarantine answered "10 days"** from the DAHD rule on storing materials, not "21 days" for new birds
   (`tnau-biosecurity`). Same remedy: the reranker sees only 650 characters; check `focusPassage` picks the bird
   sentence.
6. **Shed heights answered from the project** (2.1 and 3.5 m) instead of the guide's ranges (6 to 7 ft, 10 to 12 ft).
   The question is general, so the prompt could say: general questions are answered from the SOURCES, project
   questions from the PROJECT FACTS.

## 3. Data and checks that need a person

- **Supabase migration** `supabase/migrations/20261020020000_poultry_reference_data.sql` is not applied to the live
  project (the database is shared with the polyhouse app). Apply it, then run `node backend/scripts/loadReferenceData.js`.
- **Unverified figures**, flagged in the data with `verified: false` and in the app as "verify":
  environment-controlled shed rate, semi-automatic and automatic equipment, automatic curtains, roof sheets other than
  GI, footbath and anteroom, the egg price (secondary NECC quote), the Rs 100/kg broiler sale price (planner
  assumption), and the Maharashtra scheme (no official GR found yet).
- **The broiler default price leaves almost no profit:** at Rs 100/kg live weight the recommended shed makes Rs 6,939 a
  year (break-even Rs 99.41/kg); at Rs 110 it makes Rs 1,24,412. Check the default against current farm-gate prices.
- **Hindi and Marathi** poultry terms need a native speaker's review before release.
- **CPCB guideline text** could not be downloaded (the India Environment Portal page timed out). Its rules are in the
  siting table; when the page or the CPCB PDF is reachable, run `python datasets/scripts/fetch_knowledge.py` again.
- **NABARD unit costs** are for Jharkhand only; add other states' unit costs when they are found.

## 4. Smaller leftovers

- **`backend/studio`**, the developer "API Studio" page served at `/studio`, still animates a polyhouse beside the API
  and database. It is not part of the app; redraw it as a shed or remove it.
- **`src/components/farm/scene/sceneMaterials.ts`** keeps the polyhouse's water-motion modes (`fall`, `spray`, `mist`,
  `flow`); only `sway` is used now (the landscape's trees and grass).
- **The polyhouse tables** (`cost_norms`, `midh_area_limits`, `mandi_prices_daily`) stay in the shared database and its
  migrations, because the polyhouse app uses them; this app no longer reads or loads them.
