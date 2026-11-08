# Kukkut

**Plan a poultry farm in India and see whether it pays, before you build.**

Kukkut (कुक्कुट, from कुक्कुटपालन, poultry farming in Hindi and Marathi) is for farmers planning a new or bigger shed, and
for the bank and subsidy officers who read their plans. Design the shed in 3D, cost it against NABARD's unit costs, see
the yearly profit, the schemes and bank loan that apply, the risks, and export a bank-ready report, in English, Hindi
and Marathi.

It is honest by design: every figure shows its official source, unverified prices are marked "verify", a loss is shown
as a loss, and the AI advisor answers only from official documents and the project's own numbers.

## Quick start

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+ and git.

```sh
git clone https://github.com/devkaranpatil/Poultry-App-Dev.git kukkut
cd kukkut
npm start
```

`npm start` installs everything that is missing, creates the settings files, and runs the website and the API
together. Open **http://localhost:8080**. Ctrl+C stops both. Run it again any time: it only installs what changed.

| Command | What it does |
|---|---|
| `npm start` | Install what is missing, then run the website (port 8080) and the API (port 5000) |
| `npm start -- --with-ai` | The same, after downloading the AI models (about 3 GB, once) |

Out of the box it uses a local database inside the API (no install). What works straight away and what needs setting up:

| Works at once | Needs a setting |
|---|---|
| Landing page, the free estimate, the calculations | **Sign-in, saved projects, the workspace:** a Supabase project (below) |
| | **The AI advisor:** the models (`--with-ai`) and the official documents (below) |

### Sign-in (Supabase)

Create a free project at [supabase.com](https://supabase.com), then fill in:

- `.env`: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Dashboard > Project Settings > API)
- `backend/.env`: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` (the same values); `DATABASE_URL` can stay on the local
  database or point to the project's Postgres (the "Session pooler" string)

`backend/.env.example` explains every setting, including Google sign-in and email.

### The AI advisor

The advisor runs inside the API on open-source models (`node-llama-cpp`); nothing is sent to an outside AI service.

```sh
npm start -- --with-ai                       # the chat, search and reranking models, about 3 GB, once
python datasets/scripts/fetch_knowledge.py   # the official documents it reads (needs poppler's pdftotext, or pip install pypdf)
```

How it answers:

1. A Hindi or Marathi question is put into English (the documents are English).
2. Keyword search (BM25) and multilingual embeddings (bge-m3) each rank the passages; a reranker (bge-reranker-v2-m3)
   keeps the ones that answer the question.
3. The chat model (Qwen3-4B, Apache-2.0) answers only from those passages and the project's own numbers, citing them.
   Subsidies come only from the planner's scheme check, and "what if" questions are worked out by the planner itself.
4. The answer ends with its sources and a warning for any figure found in neither the sources nor the project.

It reads about 34 official sources (NLM-EDP and AHIDF guidelines, NABARD unit costs and model projects, NCDC, DAHD
biosecurity, TNAU and Vikaspedia, state schemes), listed with their status in `datasets/knowledge/manifest.json`. The
downloaded text is git-ignored because some of it is copyrighted. On a laptop CPU an answer takes 40 to 90 seconds;
the evaluation set scores 78 of 85 (`cd backend && npm run eval:assistant`).

## What it does

- **Design** the shed in 3D: size and heights, shed type (open-sided, environment-controlled with tunnel fans and
  cooling pads, backyard), roof, frame, sheets, side walls and curtains, entry, birds (broilers, layers in cages or on
  litter, improved desi) and feeding. The flock follows from the floor area and the stocking density, and the birds
  peck and wander in the model.
- **Cost** from NABARD's 2023-24 unit costs, with the first batch's working capital, compared with NABARD's own unit
  cost for the same flock.
- **Earnings:** batches a year or the layer cycle, feed, running costs, profit, payback and the break-even price,
  independent or on contract, from editable prices that each show their source.
- **Schemes and loan:** NLM-EDP, AHIDF and state schemes, each with why it does or does not apply; the bank loan with
  margin, instalments and the yearly debt cover.
- **Site and rules:** CPCB consent and siting distances above 5,000 birds, and the district's heat-stress months
  (NASA POWER climate).
- **Risk:** a Monte Carlo simulation of mortality, feed conversion, prices, build cost and outbreaks.
- **Report:** a PDF in the order of a bank DPR, and Excel with live formulas that match the app's figures.
- **Save, compare and share** setups.

The workspace is a guided journey in three phases: **Plan the shed** (Design, Site & rules), **Check the money**
(Cost, Earnings, Loan, Risk) and **Share it** (AI summary, Report). Each step answers one question and opens with an
"In short" line built from your figures. The advisor opens from "More options" (⋯), docked beside the step on a laptop
and full screen on a phone; the money steps also carry a small "Ask about these figures" box.

## Project layout

| Path | What it is |
|---|---|
| `src/` | The website: React, Vite, TypeScript, Tailwind, Three.js for the 3D shed |
| `backend/` | The API: Express, the poultry calculations, schemes, risk, saved setups, the AI advisor |
| `shared/` | Used by both: the app name, states and districts, the poultry norms and prices with their sources |
| `datasets/` | Official CSV tables, the AI knowledge manifest and fetch scripts, the assistant's evaluation set |
| `supabase/` | Database migrations |
| `deploy/` | Server scripts for the free hosting set-up |
| `scripts/start.mjs` | The one-command install and run |
| `e2e/`, `src/test/` | Browser tests (Playwright) and unit tests (Vitest) |
| `docs/` | Status, architecture, the 3D scene, deployment and the open tasks |

## Testing

```sh
npm test                  # unit and integration tests (Vitest, website and API)
npm run test:e2e          # browser tests (Playwright) on their own servers and an in-memory database
npm run test:e2e:scene    # the long 3D sweep: every setup option in the viewer
npm run ci                # lint, types, tests with coverage and the build, as CI runs them
```

Run `npm run test:e2e:install` once on a new machine to get the test browser. GitHub Actions runs the checks and the
browser tests on every push (`.github/workflows`).

## Deploying

[docs/deploy.md](docs/deploy.md) walks through a free set-up: the website on Cloudflare Pages, the API and the AI on
an Oracle Cloud Always Free server in Hyderabad, HTTPS through DuckDNS and Caddy, sign-in and data on Supabase. In
production the API needs `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` and
`CORS_ORIGINS`, and refuses to start without them.

## Status and limits

A working prototype, not yet launched. Before inviting users ([docs/launch-readiness.md](docs/launch-readiness.md)):
dated local price quotes, a native review of the Hindi and Marathi wording, a poultry expert's review of the key
calculations, and trials with growers and lenders.

What users should know: at today's default prices the default 14 x 7 m Maharashtra shed loses money (the app shows
this and the defaults are not tuned to hide it); several rates are unverified and marked so; schemes cover 11 states;
PDF reports are English only; the AI can be wrong, so check important figures against the cited source.

More: [project status](docs/project-status.md), [backend architecture](docs/backend-architecture.md),
[3D shed](docs/3d-scene.md), [open tasks](docs/remaining/README.md). Kukkut began as a polyhouse planner (GreenhouseIQ),
kept on the `polyhouse` git tag; the migration is in [docs/migration](docs/migration/README.md).
