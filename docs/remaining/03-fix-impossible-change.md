# 03. An impossible change gets no limit

**Status:** done. Fixed in code on 2026-10-23; every question under "Done when" passed in the rerun of task 01 (78 of 85, 2026-11-02).

## The fault

"What if I make the shed 10 km long?" was answered with general advice. The planner's answer is that the length must
be between 2 and 150 m (`shared/poultry-limits.json`). Failed question: `whatif-impossible`.

## Why it happens (likely)

The model reads the question as `lengthM: 10000`. `groundExtraction` in `backend/services/whatIf.js` (line 96) keeps a
number only when it appears in the question, and the question contains `10`, not `10000`. So the length is dropped,
nothing changes, `planScenario` returns null, and the model answers without the planner's error block.

## What to do

1. In `groundExtraction`, accept a length or width that the question gives in another unit: when the question has
   "km" or "kilometre" and the number times 1,000 matches, keep it (likewise "ft"/"feet" times 0.3048 when that is
   added).
2. Add a unit test: "make the shed 10 km long" with an extraction of `lengthM: 10000` keeps the length, and
   `planScenario` returns `{ error: "Length must be between 2 and 150 m" }`.

## What was done (2026-10-23)

groundExtraction accepts a length or width given in km or feet, and an area in sq ft, converted to metres, whether the model converted it (10000) or copied the bare number (10). "10 km long" now returns the planner error "Length must be between 2 and 150 m". Tests: src/test/what-if.test.ts.

## Done when

`npm run eval:assistant -- --only=whatif-impossible` passes, and the new unit test passes.
