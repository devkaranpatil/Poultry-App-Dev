# Remaining work

What is left after the polyhouse to poultry migration (all seven phases are merged and tagged `phase-1` to
`phase-7`; the polyhouse code is on the `polyhouse` tag). One file per task. Each says what the task is, why it is
open, what to do, and how to check it is done.

Last updated: 2026-10-20.

## The AI assistant

| # | Task | Who | Size |
|---|---|---|---|
| 01 | [Run the assistant evaluation to the end](01-run-ai-evaluation.md) | developer | about 1.5 hours of machine time |
| 02 | [What-if answers quote the wrong column](02-fix-what-if-answers.md) | developer | small |
| 03 | [An impossible change gets no limit](03-fix-impossible-change.md) | developer | small |
| 04 | [Project cost questions quote the wrong figure](04-fix-project-cost-figures.md) | developer | small |
| 05 | [Broiler vaccine ages come from the layer schedule](05-fix-vaccine-answers.md) | developer | medium |
| 06 | [Quarantine answered from the wrong rule](06-fix-quarantine-answer.md) | developer | small |
| 07 | [General questions answered from the project](07-fix-general-questions.md) | developer | small |

Do 01 first: its full result shows which of 02-07 matter most, and every fix is checked by rerunning its questions.

## Data and checks that need a person

| # | Task | Who | Size |
|---|---|---|---|
| 08 | [Apply the poultry migration to the live database](08-apply-database-migration.md) | owner of the Supabase project | small |
| 09 | [Check the unverified rates and the default prices](09-check-rates-and-prices.md) | someone who can get current quotes | medium |
| 10 | [Native review of Hindi and Marathi](10-review-hindi-marathi.md) | native speakers | medium |
| 11 | [Fetch the CPCB guideline text](11-fetch-cpcb-guideline.md) | developer | small |
| 12 | [NABARD unit costs and schemes for more states](12-more-states.md) | developer or researcher | medium per state |

## Clean-up

| # | Task | Who | Size |
|---|---|---|---|
| 13 | [Small leftovers from the polyhouse](13-small-leftovers.md) | developer | small |
