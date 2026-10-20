# 10. Native review of Hindi and Marathi

**Status:** open. Needs native speakers, ideally people who know poultry farming.

## Why it is open

About 1,000 labels per language are in `src/i18n/messages.ts`. The poultry wording was written without a native
review. Farming terms matter most: breed and shed names, litter, brooding, feeders and drinkers, curtains, mortality,
contract farming, schemes and loans. Some words are the same in Hindi and Marathi on purpose (for example "पक्षी");
`messages.mr` falls back to Hindi for any key it does not have.

## What to do

1. Read the app in each language (the language switch is in the top bar), step by step, including the design sidebar
   tabs, the option cards, the explanations behind "?" and the report.
2. Note wrong, unnatural or English-sounding terms with the key or the screen where they appear.
3. Fix them in `src/i18n/messages.ts` and run `npx vitest run src/test/i18n-poultry.test.ts`.
4. The assistant swaps Hindi and Marathi farming words for English before searching (the list in
   `backend/routes/ai.js`, around line 399): add the reviewers' common words there too.

## Done when

A reviewer for each language has signed off, and the language questions of the evaluation (`hi-*`, `mr-*`) pass.
