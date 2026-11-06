# 01. Run the assistant evaluation to the end

**Status (2026-11-06):** full run after task 12 (28 states' NABARD units and 11 states' schemes) on a CPU laptop: **74 of 85**. The drop came from the new data: three NABARD questions asked for "NABARD's unit cost" with no state (now they name Jharkhand 2023-24), the model quoted another state's unit for this project (now NABARD and scheme passages are tagged by state and the project's state is boosted, and the facts carry the comparison in words), and it dropped the siting rules behind the longer scheme list (now listed earlier, and the under-5,000-birds note names the rules that still apply). Reruns: all 12 project questions and the 3 NABARD questions pass. Still failing: shed-heights, space-broiler, litter-max, edge-typos, hi-broiler-space, and edge-no-source-quail and edge-follow-up, which fail on the code before task 12 too. Reports: `backend/.data/eval-2026-11-05T17-17-22-282Z.txt` (full) and the four after it.

**Status (2026-11-05):** rerun after the price changes on a CPU laptop: **79 of 85**. All 23 project and what-if questions
pass on the new figures. Open fact failures (wording or retrieval, not figures): shed-heights, space-broiler, litter-max,
nabard-layer-1000, plus edge-typos and hi-broiler-space. Reports: `backend/.data/eval-2026-11-04T19-36-44-040Z.txt` and the
three after it.

**Status:** the rerun on the fixed code is done: **78 of 85** on a GPU (2026-11-02), up from 65. Five of its seven
failures are fixed the same day and need a rerun of just those questions; two are open (below).

## Rerun on the fixed code (Qwen3-4B, 20 of 36 layers on a GPU, 2026-11-02)

**78 of 85 passed.** Run in two parts (the first was stopped for lack of memory after 57 questions). Report of the
second part: `backend/.data/eval-2026-11-02T10-51-30-365Z.txt` on the GPU machine.

| Kind | Passed | Failed |
|---|---|---|
| fact | 35 / 38 | space-controlled, litter-max, brooding-reduce |
| project | 11 / 12 | project-siting |
| what-if | 9 / 11 | whatif-5000, whatif-puf |
| edge | 15 / 15 | |
| language | 3 / 4 | hi-broiler-space |
| http | 5 / 5 | |

Tasks 02-07 and 11 are closed by it: every question they were for now passes, except `whatif-5000` and `whatif-puf`,
whose new causes are below.

- `whatif-puf` answered in 19 s: the planner was never asked. "How much would the shed cost with a PUF panel roof?"
  matched none of the what-if words. Fixed: "would ... cost/earn/make/pay/profit" now counts (`looksLikeWhatIf`).
- `whatif-5000`: the answer did not say 5,010, the birds the longer shed holds. Fixed: the planner block says the
  number asked for and the number the shed holds, and to give both.
- `project-siting`: fixed by naming the facts `siting.rulesForThisFarm` and adding `siting.notForThisFarm` (the CPCB
  rules apply only above 5,000 birds).
- `brooding-reduce` (no "70"): the Vikaspedia line reads "reduced at the rate of 5 °F weekly until 70 °F in 6th
  week" after the repair, but TNAU says "until it reaches the room temperature", and a keyword search finds TNAU first.
  Both are right, so the question now also accepts "room temperature".
- `hi-broiler-space` (said 2 sq ft): "डीप लिटर" and "जगह" were not in the glossary swapped into English before the
  question is translated (`FARMING_TERMS`); now "deep litter" and "space" (also "बिछावन", Marathi "जागा"). Not a bare
  "लिटर", which is also a litre. A search on the swapped question finds the 1 sq ft passages (`planner-birds`,
  `tnau-broiler-management`); the 2 sq ft is probably the layer figure in `tnau-housing` next to it.
- Open, to be read in the report before anything is changed (the answers are only in the report on the GPU machine):
  - `space-controlled` (no "0.7"): the keyword search ranks `dataset-production-norms#2` ("broiler in a
    environment-controlled shed: floor space 0.7 sq ft") second, so the passage is found; read what the answer said.
  - `litter-max` (no 8-12 inch range): the keyword search ranks first a `tnau-housing` passage that has the range;
    read the answer.

Rerun the changed ones with
`npm run eval:assistant -- --only=whatif-puf,whatif-5000,project-siting,brooding-reduce,hi-broiler-space`.

## Full result before the fixes (Qwen3-4B, 2026-10-23)

**65 of 85 passed.** Report: `backend/.data/eval-2026-10-23T02-20-31-275Z.txt`.

| Kind | Passed | Failed |
|---|---|---|
| fact | 29 / 38 | shed-heights, litter-max, brooding-reduce, vacc-marek, vacc-rd-f1, vacc-ibd, vacc-lasota, disinfectant, quarantine |
| project | 9 / 12 | project-total, project-working-capital, project-siting |
| what-if | 7 / 11 | whatif-5000, whatif-price-110, whatif-puf, whatif-impossible |
| edge | 12 / 15 | edge-no-source-quail, edge-typos, edge-follow-up |
| language | 3 / 4 | hi-broiler-space |
| http | 5 / 5 | |

What the failures were, and what was changed for them (all on 2026-10-23, with unit tests):

- The four vaccine questions, `edge-follow-up` (LaSota) and probably `disinfectant`: the broiler vaccination table was
  in **no passage at all**. Pages converted from HTML put each table cell in a paragraph of its own; `chunkText` took
  each cell for a heading and dropped it. About 150 tables in 19 of the 21 documents were affected. Tables are now
  joined into one passage under their heading (task 05).
- `brooding-reduce`: the model said to lower the heat "50°F each week". The TNAU brooding page writes "reduce 50F",
  which is 5 °F with the degree sign lost. The degree-sign repair now runs on that page, the TNAU disease page and the
  DAHD rules too.
- `quarantine` (task 06), `project-total` and `project-working-capital` (task 04), `shed-heights` (task 07), the four
  what-if failures (tasks 02 and 03), `edge-typos` (the CPCB page, task 11).
- `project-siting` listed the CPCB distances, which apply only above 5,000 birds, for a 1,054-bird farm. The task 07
  rule ("my farm" questions are answered from the project facts) is meant to cover it.
- Not addressed: `litter-max` (the answer found no depth; the TNAU litter page has "8-12”"), `edge-no-source-quail`
  (gave an incubation temperature after saying there is no source) and `hi-broiler-space` (Hindi answer said 2 sq ft).

## What to do

1. Close browsers and other heavy programs. Run one evaluation at a time. The rerun first embeds the new passages
   (about 4 minutes), then answers.
2. Run it (the models are already downloaded in the polyhouse repo, so point at them instead of downloading again):

   ```
   cd backend
   LLM_MODELS_DIR=C:/Users/karan/Desktop/Development/Polyhouse-App-Dev-master/backend/.models npm run eval:assistant
   ```

   85 questions take about 1 to 1.5 hours. The answers go to `backend/.data/eval-<time>.txt`.
3. To rerun only some questions: `npm run eval:assistant -- --only=id1,id2`.
4. If you stop a run, or it is stopped for you, make sure its processes are gone before starting another (PowerShell):

   ```
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*evalAssistant*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

## Done when

- ~~A run on the fixed code ends with a `# score` line for all 85 questions, and passes at least the 65 above.~~ 78 of
  85 (2026-11-02), recorded in `docs/project-status.md`.
- The five questions fixed on 2026-11-02 pass on a rerun, and the two open answers are read and either fixed or
  accepted.
