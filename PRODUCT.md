# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: Indian poultry farmers** planning a new shed or expanding one, often first-time or unconfident app users. They are deciding whether a broiler, layer or improved-desi project in their own district can pay, and what drives the result.

**Secondary: bank and subsidy officers** (and the consultants who prepare reports for farmers). They read the report the farmer produces and judge whether the figures and their sources can be trusted for a loan or scheme decision.

## Product Purpose

The first promise: "Estimate whether a poultry farm project in your district can work, and see what drives the result." Every feature is judged against that sentence.

The journey goes from estimate to refinement. A free estimate needs no account: state, district, bird type and shed size give a base, downside and upside case. "Save and refine" carries that estimate into the workspace as the same project, so nothing has to be typed again. The workspace is a guided seven-step journey, **Design → Site & rules → Cost → Earnings → Loan → Risk → Report**, ending in a bank-ready report.

Success means growers, consultants and lenders trust the estimate enough to use it in a real decision. This has not been validated yet (see Evidence on Hand).

## Positioning

**Honest, sourced feasibility.** Every figure carries its official source (NABARD 2023-24 unit costs, scheme guidelines, CPCB rules, NASA POWER climate) and a "verify" mark when it is unverified. A loss is shown as a loss, and default prices are never tuned to make the result look good. The AI assistant answers only from cited official documents and the project's own numbers. "What if" questions are answered by the planner's calculator, not by the model.

## Operating Context

- Farmers mostly use **low- to mid-range Android phones on patchy mobile data**, often with **low digital literacy**.
- Consultants and officers review plans and reports **on a laptop at a desk**.
- The output goes into a bank or subsidy process: a PDF in the order of a bank DPR, and Excel with live formulas that match the app's figures.
- Prices change a lot (broiler prices moved between Rs 99 and Rs 138 a kg from June to August 2026). Read any one price as a point in a range.

## Capabilities and Constraints

- **Estimate** (`/estimate`, no account): three cases, plus editable sale, feed, chick and mortality figures, each with its source.
- **Design** a shed in 3D (Three.js): size, shed type (open-sided, environment-controlled, backyard), roof, frame, sheets, walls and curtains, entry, birds, feeding. The flock size follows from floor area and stocking density.
- **Cost** from NABARD unit costs plus first-batch working capital. **Earnings**: batches, feed, profit, payback, break-even price, independent or on contract.
- **Schemes and loan**: NLM-EDP, AHIDF and state schemes, each checked with a reason. When none applies, the screen says so plainly. The bank loan covers up to 90%.
- **Site and rules**: CPCB consent and siting distances above 5,000 birds, plus the district's heat-stress months.
- **Risk**: Monte Carlo over mortality, FCR, prices, build cost and outbreaks.
- **AI assistant**: runs on local open-source models on the project's own server (CPU answers take about 40-90 s), with sources cited.
- **Save, compare, share, export** (PDF and Excel). **Languages**: English, Hindi, Marathi. PDF reports are English only.
- Each step answers one question, opens with an "In short" sentence built from the user's figures, puts hard words behind a "?" and keeps tables and sources under "Show details".
- Stack: React + Vite + TypeScript frontend, Express backend, Supabase Postgres and Auth. The UI redesign does not change the backend or its API.
- Known limits users must be told: scheme coverage is 11 states; the Bihar, Odisha, Uttarakhand and UP scheme texts are OCR of scans; several rates are unverified (environment-controlled shed, semi-automatic and automatic equipment, automatic curtains, non-GI sheets, footbath and anteroom, egg and broiler sale prices); heat stress uses monthly means.

## Brand Commitments

- Name: **Kukkut** (कुक्कुट, from कुक्कुटपालन, the word for poultry farming in Hindi, Marathi and the scheme papers), chosen 2026-11-08; set in one place (`shared/app.json`) that every screen, the report and the emails read. Trademark and domain not yet checked.
- Logo: a hen in profile on forest green, comb, beak and feet in straw (`src/components/brand/Logo.tsx`, `public/favicon.svg`).
- Voice: plain, direct and honest. Short sentences, no jargon without a "?" explanation, and losses and unverified figures stated openly.

## Evidence on Hand

- Real calculator output: the landing example and `/estimate` call the same `/api/farm/calculate`. At today's default prices the default 14 x 7 m Maharashtra shed **loses money** (break-even about Rs 111.5/kg against a Rs 95 farm-gate price, 2026-11-04). This must stay visible.
- Official sources: `datasets/knowledge/manifest.json` (about 34 documents), `shared/poultry-norms.json` (every figure with its source and `verified` flag).
- Assistant evaluation: 78 of 85 (`docs/remaining/01`).
- **Absent, and not to be fabricated**: testimonials, named customers or farms, lender endorsements, user counts, validation results (not started), an independent poultry-expert review (brief written, no reviewer yet), dated price quotes, and a native-speaker review of the Hindi and Marathi wording.

## Product Principles

1. **Truth over persuasion.** Show a loss as a loss, mark unverified figures, and never tune defaults to look better.
2. **Every number has a source.** A figure the user can't trace to an official document or their own input doesn't ship.
3. **One question per screen, in plain words.** A first-time farmer on a phone must be able to follow each step. Depth sits behind "Show details", not up front.
4. **Estimate first, refine later.** Value comes before an account, and nothing the user typed is lost when they continue.
5. **The report must survive a bank officer's reading.** Figures, order and sources hold up on a desk-side review, not only on a phone.

## Accessibility & Inclusion

- Built for low- to mid-range Android phones on slow networks: light pages, no layout shift, content never hidden behind JavaScript-driven animation, and `prefers-reduced-motion` respected.
- Low digital literacy: plain words, few choices per screen, clear Back and Next, and help in context.
- Three languages (English, Hindi, Marathi) with Devanagari-capable type throughout. Hindi and Marathi wording still needs native review.
- No formal WCAG level has been agreed yet (open decision).
