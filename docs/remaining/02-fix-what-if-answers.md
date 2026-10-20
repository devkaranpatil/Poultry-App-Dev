# 02. What-if answers quote the wrong column

**Status:** open. Found by the evaluation on 2026-10-20 (task 01).

## The fault

For "what if I grow on contract?", "what would a PUF roof cost?" and "what if I build an environment-controlled shed?"
the model listed the project's **current** figures as if they were the result. For contract farming it said profit
Rs 6,939 and payback 81.7 years; the planner's figures with the change are Rs 23,495 and 16.9 years. The chat's table
under the answer is right; only the model's sentence is wrong.

Failed questions: `whatif-contract`, `whatif-puf`, `whatif-controlled`, and partly `whatif-5000` (bird count missing)
and `whatif-price-110` (payback missing).

## Why it happens

`scenarioBlock` in `backend/services/whatIf.js` (line 231) writes one line per figure with both values:
`Yearly profit: now Rs 6,939; with the change Rs 23,495`. The 4B model often copies the first number on the line.

## What to do

1. Put the result first and on its own: a block "WITH THE CHANGE" listing every figure, then a separate block "NOW".
   Or a two-column table the model can copy row by row.
2. Add to the rule in the block: "Answer with the WITH THE CHANGE figures; mention NOW only to compare."
3. Keep `src/test/what-if.test.ts` passing, and update its expected text.

## Done when

`npm run eval:assistant -- --only=whatif-contract,whatif-puf,whatif-controlled,whatif-5000,whatif-price-110` passes
all five.
