# 04. Project cost questions quote the wrong figure

**Status:** open. Found by the evaluation on 2026-10-20 (task 01).

## The fault

"What is the total project cost including the first batch?" was answered with NABARD's unit cost for the flock
(Rs 6,26,076) instead of the project cost (Rs 5,66,774). "How much working capital does the first batch need?"
failed the same way. Failed questions: `project-total`, `project-working-capital`.

## Why it happens (likely)

The project facts (`buildProjectFacts` in `backend/routes/ai.js`, around line 82) name the figures `capital`,
`firstBatchWorkingCapital`, `project`, `financedByFarmer` and `nabardNormForThisFlock`. The short name `project` does
not say "including the first batch", so the model picks the other large number.

## What to do

1. Rename the facts so each says what it is: `buildAndEquipShed`, `firstBatchWorkingCapital`,
   `totalWithFirstBatch`, `nabardUnitCostForThisFlock` (keep the values).
2. Update anything that reads those names (the tests of the AI route, and the what-if figures if they share them).

## Done when

`npm run eval:assistant -- --only=project-total,project-working-capital,project-capital,project-nabard` passes all four.
