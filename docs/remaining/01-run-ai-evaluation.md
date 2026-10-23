# 01. Run the assistant evaluation to the end

**Status:** the full run is done on the code before the fixes (65 of 85, 2026-10-23). The rerun on the fixed code
(tasks 02-07 and 11) is still to do: it was stopped by the laptop running out of memory before its first answer.

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

- A run on the fixed code ends with a `# score` line for all 85 questions, and passes at least the 65 above.
- The score is recorded in `docs/project-status.md` (the "Assistant evaluation" row) and in the assistant-findings
  memory, and tasks 02-07 and 11 are closed or reopened by it.
