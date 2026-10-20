# 09. Check the unverified rates and the default prices

**Status:** open. Needs someone who can get current quotes (suppliers, a NABARD or bank officer, farmers).

## Why it is open

Every figure in `shared/poultry-norms.json` names its source, and some sources are secondary or the planner's own
assumption (`verified: false`, shown in the app as "verify").

| Figure | Planner value | Source now |
|---|---|---|
| Environment-controlled shed | Rs 1,000 per sq ft (Rs 800 to 1,200) | secondary summary |
| Semi-automatic equipment (pans and nipples) | Rs 90 a bird | assumption |
| Automatic feed and nipple lines | Rs 150 a bird | assumption |
| Cages with automatic feeding | Rs 250 a bird | assumption |
| Automatic curtains | Rs 600 per metre of side wall | assumption |
| Roof sheets other than GI (galvalume, fibre cement, PUF, thatch) | Rs 550 / 300 / 1,400 / 100 per sq m | assumption |
| Footbath; anteroom size | Rs 3,000; 60 sq ft | assumption |
| Egg price | NECC Namakkal quote, July 2026 | secondary |
| **Broiler sale price** | **Rs 100 a kg live** | assumption |
| Contract growing charge | Rs 7 a kg | assumption |

## The broiler price matters most

At Rs 100 a kg the recommended shed (14 x 7 m, 1,054 broilers, Nagpur) makes only **Rs 6,939 a year**
(break-even Rs 99.41 a kg), so payback looks like 81.7 years. At Rs 110 a kg it makes Rs 1,24,412 and pays back in
4.6 years. The default decides the first impression of the whole app.

## What to do

1. For each row, find a current quote or a published figure, with its date and where it came from.
2. Update the value and its source in `shared/poultry-norms.json`; set `verified: true` only for an official or
   published source.
3. Run `npm test` (the data tests keep the CSVs and code equal) and `node backend/scripts/auditCalculations.js`.
4. If figures the eval set expects change (project and what-if questions), update
   `datasets/eval/assistant-questions.json` from the planner's new figures.

## Done when

Every row above has a dated source, and the "Known limits" in `docs/project-status.md` are updated.
