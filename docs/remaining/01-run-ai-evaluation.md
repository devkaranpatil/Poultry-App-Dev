# 01. Run the assistant evaluation to the end

**Status:** open. Stopped part-way on 2026-10-20 at the user's request.

## Why it is open

The evaluation runs the 85 questions in `datasets/eval/assistant-questions.json` through the real chat route and the
real local models. It was stopped after 67 questions. Earlier, the laptop ran low on memory: a first run kept going in
the background after it was reported stopped, so two runs (two copies of the models) shared the 17 GB, and answers
slowed from about 45 s to several minutes each.

## Partial result (Qwen3-4B, 67 of 85 answered)

**50 passed.**

| Kind | Passed | Not reached |
|---|---|---|
| fact | 29 / 38 | |
| project | 10 / 12 | |
| what-if | 5 / 11 | |
| edge | 6 / 6 answered | 9 |
| language | | 4 |
| http | | 5 |

Two fact failures (`litter-start`, `litter-max`) were the test's fault: the answer was right ("3” to 5”") but the
pattern did not allow an inch mark. Those patterns are fixed, and `brooding-reduce` now also accepts "5°". The real
faults are tasks 02 to 07.

## What to do

1. Close browsers and other heavy programs. Run one evaluation at a time.
2. Run it (the models are already downloaded in the polyhouse repo, so point at them instead of downloading again):

   ```
   cd backend
   LLM_MODELS_DIR=C:/Users/karan/Desktop/Development/Polyhouse-App-Dev-master/backend/.models npm run eval:assistant
   ```

   The embeddings for the 1,026 passages are cached in `backend/.data/rag-embeddings.json`, so it starts answering
   straight away. 85 questions take about 1 to 1.5 hours. The answers go to `backend/.data/eval-<time>.txt`.
3. To rerun only some questions: `npm run eval:assistant -- --only=id1,id2`.
4. If you stop a run, make sure its processes are gone before starting another (PowerShell):

   ```
   Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*evalAssistant*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
   ```

## Done when

- The report ends with a `# score` line for all 85 questions.
- The score is recorded in `docs/project-status.md` (the "Assistant evaluation" row) and in the assistant-findings
  memory, and this file's status is set to done.
