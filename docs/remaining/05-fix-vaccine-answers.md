# 05. Broiler vaccine ages come from the layer schedule

**Status:** done. Fixed in code on 2026-10-23; every question under "Done when" passed in the rerun of task 01 (78 of 85, 2026-11-02).

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

## What was done (2026-10-23)

The cause was not ranking: the broiler table was in no passage. chunkText (backend/services/rag/text.js) took each table cell, a paragraph of its own, for a heading and dropped it; about 150 tables in 19 documents were lost. Runs of four or more short paragraphs are now joined into one passage under their heading ("Vaccination schedule: Age | Vaccine | ..."). The bird boost was added too: birdKind tags in datasets/knowledge/manifest.json and a factor of 1.15 in routes/ai.js. Note that the TNAU disease page has its own broiler table (IBD at 12-14 days, the LaSota booster on day 28), so a LaSota answer of 28 days is from a real source.

## Done when

`npm run eval:assistant -- --only=vacc-ibd,vacc-rd-f1,vacc-lasota,vacc-marek` passes all four, and a run of all the fact
questions passes at least as many as before.
