# 05. Broiler vaccine ages come from the layer schedule

**Status:** open. Found by the evaluation on 2026-10-20 (task 01).

## The fault

"At what age is the IBD vaccine given to broilers?" was answered "16 weeks", which is an age on the layer schedule.
The broiler schedule in the TNAU broiler management page says: Marek's at the hatchery, RD F1 on day 5-7, IBD on
day 14, RD LaSota on day 21 in drinking water, IBD booster on day 28. Failed questions: `vacc-ibd`, `vacc-rd-f1`,
`vacc-lasota`.

## Why it happens (likely)

The TNAU disease page (`tnau-disease`, 37 passages) has long vaccination tables for layers and breeders, and they
outrank the short broiler table in `tnau-broiler-management`. The question says "broilers", but retrieval does not
favour passages about the bird asked about.

## What to do

1. Tag passages with the bird they are about: in `backend/services/rag/corpus.js`, give the documents a
   `tags: { bird: ... }` (`tnau-broiler-management` and `vikaspedia-broiler`: broiler; `tnau-layer-management`,
   `tnau-grower-management` and `vikaspedia-layer`: layer).
2. In the retriever, add a small boost when the question names a bird (broiler, layer, hen, desi) and the passage is
   tagged with it, as is already done for the project's district. Keep the boost small (the findings memory warns that
   large priority multipliers crowd out the right text).
3. Measure with the fact questions before and after, not only the vaccine ones.

## Done when

`npm run eval:assistant -- --only=vacc-ibd,vacc-rd-f1,vacc-lasota,vacc-marek` passes all four, and a run of all the fact
questions passes at least as many as before.
