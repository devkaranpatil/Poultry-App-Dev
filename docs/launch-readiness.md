# Launch readiness

The one current checklist. When a task is done or a limit changes, change it here first; `project-status.md` describes
what the product does and how it is checked, and `docs/remaining` holds the detail for each open task.

Last updated: 2026-11-07.

**The first promise:** "Estimate whether a poultry farm project in your district can work, and see what drives the
result." Everything below is judged against that sentence. Other features (3D design, risk simulation, schemes, AI
advice, Hindi and Marathi) support it and are not the pitch.

## Done

| What | Where |
|---|---|
| Poultry migration, 7 phases | `docs/project-status.md` |
| Live database migration applied (2026-11-05) | `docs/remaining/08` |
| NABARD unit costs for all 28 states, schemes for 11 states (2026-11-06) | `docs/remaining/12` |
| Small polyhouse leftovers removed (2026-11-04) | `docs/remaining/13` |
| **No-account estimate** at `/estimate`: state, district, bird type and shed size in; base, downside and upside cases out; sale price, feed, chick and mortality editable, each with its source and a "verify" mark when unverified (2026-11-07) | `src/pages/Estimate.tsx`, `src/lib/estimateScenarios.ts` |
| **Landing example from the calculator**: the card calls the same `/api/farm/calculate`, shows a loss as a loss, names its assumptions and says they are default prices, not a quote (2026-11-07) | `src/components/landing/ExampleEstimate.tsx` |
| **Empty document extraction detected**: a source whose text is under 500 characters is reported as unusable, left out of the knowledge base, logged at server start and named to the assistant as a gap (2026-11-07) | `backend/services/rag/corpus.js` |
| **Scanned scheme PDFs read with OCR** (2026-11-07): the six Bihar, Odisha, Uttarakhand and Uttar Pradesh scheme documents are scans; `fetch_knowledge.py` now falls back to Tesseract (Hindi and English) when a PDF has no text layer, and all six give 1,600 to 6,500 words. Hindi tables and signature blocks have some OCR noise; check an answer against the PDF before relying on a figure | `datasets/scripts/fetch_knowledge.py` |

## Open: before inviting more users

| # | What | Why it blocks | Who | Detail |
|---|---|---|---|---|
| 1 | Dated quotes for feed, chicks, sale and egg prices, equipment and an integrator contract rate. Prices show their source but not yet a date | prices drive profit; today's are secondary quotes | someone with local quotes | `docs/remaining/09` |
| 2 | Native review of Hindi and Marathi, including the new `estimate.*` and `landing.example*` wording written on 2026-11-07 | wrong wording on a money screen loses trust | native speakers | `docs/remaining/10` |
| 3 | Poultry-expert review of the highest-impact calculations (break-even, mortality, FCR, working capital) | no one outside the project has checked them | a poultry consultant | `docs/remaining/14` (brief written, no reviewer yet) |
| 4 | Validate with a few growers, consultants and lenders: do they trust the estimate enough to use it in a real decision? | decides what to build next | owner | not started |
| 5 | Assistant evaluation: 78 of 85 on 2026-11-07 (CPU, after the OCR text); seven open | answer quality | developer | `docs/remaining/01` |

## Known limits users must be told

- At today's default prices the default 14 x 7 m Maharashtra shed loses money (break-even about Rs 111.5 a kg against
  a farm-gate price of Rs 95 on 2026-11-04). The estimate and the landing card show this; do not tune the defaults to hide it.
- Broiler prices moved between Rs 99 and Rs 138 a kg between June and August 2026. Read one price as a point in a range.
- Unverified rates: the environment-controlled shed, semi-automatic and automatic equipment, automatic curtains, roof
  sheets other than GI, the footbath and anteroom, the egg price and the broiler sale price.
- Scheme coverage is 11 states. Bihar, Odisha, Uttarakhand and Uttar Pradesh documents are OCR text of scans: figures may carry reading errors.
- Heat stress uses monthly means; PDF reports are English only.

## Next, after validation (not before)

1. Local price and margin dashboard (dated broiler and egg prices, feed and chick costs, effect on break-even).
2. A short shareable feasibility report for a bank or adviser.
3. Batch calendar with cash needs across the year (the calendar of placements exists in the Earnings step).
4. Plan versus actual tracking.
5. Several sheds and phased expansion.

## How to check the product is healthy

`npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; the full list with last results is in
`docs/project-status.md`.
