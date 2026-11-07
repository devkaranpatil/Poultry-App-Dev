# 14. Brief for the poultry-expert review (launch item 3)

**Status (2026-11-07):** brief written from the code; no reviewer has seen it. Everything below was read from
`backend/services/poultry/production.js`, `costModel.js` and `backend/data/poultry/norms` on 2026-11-07.

**What we ask of a poultry consultant or farm lender:** read the formulas and the default numbers below and mark each as
*right*, *wrong, because ...* or *right for some regions only*. Half a day is enough. Reply on this page or in a copy.

## The year, for broilers (independent farmer)

Per batch, for `placed` birds:

| Step | Formula in the code |
|---|---|
| Birds sold | `placed x (1 - mortality%)` |
| Kg sold | `sold x saleWeightKg` |
| Feed eaten | `kgSold x FCR` (feed is tied to the weight sold, not to the birds placed) |
| Cost | chicks + feed x price + vaccine per bird + insurance (% of chick cost) + labour per bird + other per bird |
| Revenue | `kgSold x saleInrPerKg` + manure and gunny-bag income per bird |
| Cycle length | rearing days + cleaning days (broiler default 42 + 14 = 56 days) |
| Batches a year | `365 / cycle length` (6.5 for the default) |
| Profit, payback | `annual revenue - annual cost`; `net investment / annual profit` |
| Break-even price | `(cost - other revenue) / kg sold`: the sale price per kg at which a batch covers its running cost |

Defaults (broiler): mortality 5%, sale weight 1.8 kg, FCR 1.8, rearing 42 days, cleaning 14 days.

**Contract farmer:** the integrator pays a growing charge per kg on live weight; the farmer pays only labour and other
costs and keeps manure and bag income.

**Layers:** one flock at a time, grown to point of lay and kept for the laying weeks. Eggs = `housed x (1 - laying
mortality / 2) x eggs per hen` (half the mortality, as an average over the laying weeks). Culled birds are
`housed x (1 - laying mortality)`. Labour runs per month of the cycle; "other" running cost is scaled from the broiler
study's 56 days to the layer cycle.

## Questions we want answered

1. **FCR and weight.** Is 1.8 FCR at 1.8 kg in 42 days a fair planning figure for a small grower, or too good? What
   would you plan with for a farmer without environment control?
2. **Mortality.** Is 5% right for a 42-day broiler batch; what is the usual range, and how should layers' laying-period
   mortality and chick-to-housed losses be planned?
3. **Feed tied to kg sold.** Feed is computed from kg sold, so lost birds' feed is not counted. Is that close enough?
4. **Batches a year.** 365 / 56 gives 6.5 batches. Do growers really turn a shed that often? Some leave a longer gap
   for rest and disease breaks; what do you plan with?
5. **Working capital.** The first batch's working capital counts chicks (1.05 per bird), feed (3 kg per bird for meat),
   vaccine, insurance and labour (zero months for meat, 1.5 for layers), taken from NABARD's unit-cost studies. Does a
   grower really need this much, or more, before the first sale? Is the labour of zero months for meat right?
6. **Break-even.** It counts running cost only (no interest, no depreciation, no owner's time). Should the screen show
   a second break-even with them?
7. **What is missing?** Which costs or losses would a lender add that these formulas leave out (transport, electricity
   and fuel for brooding, disease outbreak, price risk, bird weight shortfall)?
8. **Prices.** These are not part of the review (they need dated quotes, see `09-check-rates-and-prices.md`), but say
   if the default feed or chick price looks off for your region.

## What the reviewer sees in the app

Open `/estimate`, choose a state, district and bird type, and read the base, downside and upside cases. Every price shows
its source and a "verify" mark when it is unverified. The default 14 x 7 m Maharashtra shed shows a loss at today's
defaults; that is deliberate (see `docs/launch-readiness.md`).

## Where the answers go

Record each verdict next to its question above, then fix the number in `shared/poultry-norms.json` (with the source and
the `verified` flag) or the formula in `production.js` **and** `src/lib/poultryFinance.ts`, which a test keeps equal.
