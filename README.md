# Poultry Planner (working name)

A planner for poultry farms in India, being built from a complete polyhouse planner (the GreenhouseIQ project). The app name is a placeholder: it is set in one place, `shared/app.json`, and every screen, the page title, the report and the emails read it from there.

**Migration status:** Phase 1 of 7 is done. Code, folders, routes and storage keys use neutral "farm" names; the app still plans polyhouses until Phases 2 to 5 change the domain. The research, feature changes and phased plan are in [docs/migration](docs/migration/README.md).

The rest of this README describes the polyhouse planner the code starts from, and is rewritten as the phases land.

What it does today:

- **Design** a polyhouse in 3D (size, roof, materials, ventilation, crop, irrigation, state and district).
- **Cost** it with a model calibrated on the NHB norms, adjusted for district heat and state rainfall.
- **Subsidy** under the scheme that applies: MIDH 2025 slab norms through the state mission under 4,000 m², NHB from 4,000 m².
- **Returns and risk**: payback and ROI from your own yield, price and running-cost figures (defaults from published yields and Agmarknet mandi prices, each with its source shown, and a one-click latest mandi price), plus a Monte Carlo simulation of the spread of outcomes.
- **Bank loan**: margin, instalments, total interest and the yearly debt cover (DSCR), with the subsidy adjusted against the last instalments as NHB requires; defaults from published bank terms. Plus a checklist of the steps to claim the subsidy (NHB from 4,000 m², the state mission below it).
- **Official context**: government norm, area limit, district climate (NASA POWER) and today's mandi prices.
- **AI assistant** that runs on your own server and answers from official documents, with sources. "What if" questions (another size, structure, crop, state, price, subsidy...) are answered by the planner itself, so the figures come from code, shown as a now/with-the-change table.
- **Save, compare, share and export** (PDF and Excel), in English, Hindi and Marathi.

The workspace is a guided journey of seven steps: **Design → Site → Cost → Earnings → Loan & subsidy → Risk → Report**.
- **Each step:** it answers one question, starts with an "In short" sentence built from your figures, and has Back and Next buttons.
- **Help where you need it:** a "?" beside a hard word explains it, and tables, statistics and sources sit under "Show details".
- **The advisor:** "Ask the advisor" opens the AI beside any step, with example questions for that step.
- **First visit:** a short guide explains it all and can start you from a recommended greenhouse.

More: [project status and roadmap](docs/project-status.md), [backend architecture and audit](docs/backend-architecture.md), [3D scene](docs/3d-scene.md).

## Project layout

| Path | What it is |
|---|---|
| `src/` | React + Vite frontend (TypeScript, Three.js viewer) |
| `backend/` | Express API (calculations, auth, saved configurations) backed by Postgres (Supabase) |
| `shared/` | Data used by both sides: states/districts and dimension limits |
| `datasets/` | Official CSV datasets, the AI knowledge-base manifest and fetch scripts, and the assistant's evaluation set (`datasets/eval`) |
| `supabase/` | Database migrations (Supabase Postgres) |
| `e2e/` | Playwright browser tests |
| `src/test/` | Vitest suites for the frontend and the backend API |

## Setup

Requirements: Node.js 18+ and a Postgres database (needed for login and saved configurations): a Supabase project, or `DATABASE_URL=pglite:./.data/dev-db` for a zero-setup local one (see `backend/.env.example`).

```sh
npm install
cd backend && npm install && cd ..
cp backend/.env.example backend/.env   # then fill in real values
```

Optional frontend `.env` in the project root:

```sh
VITE_API_BASE_URL=http://localhost:5000
```

## Running locally

```sh
# terminal 1 - API on http://localhost:5000
cd backend && npm run dev

# terminal 2 - frontend on http://localhost:8080
npm run dev
```

## AI assistant (runs on your own server, no API key)

The project advisor, the AI crop ranking and the chat answer from **official documents**, using open-source models that run inside the backend process (`node-llama-cpp`). Nothing is sent to an outside AI service.

```sh
cd backend && npm run models:download      # once, about 3 GB (chat model, embedding model, reranker)
python datasets/scripts/fetch_knowledge.py   # the official documents it reads (needs poppler's pdftotext, or: pip install pypdf)
```

Start the backend as usual. On the first start it indexes the documents, which takes a few minutes and is then cached in `backend/.data/`. Until the models are installed the AI features report "not configured" and everything else works.

How a question is answered:

1. A Hindi or Marathi question is put into English (the documents are English).
2. **Retrieval**: keyword search (BM25) and multilingual embeddings (bge-m3) each rank the passages; a **reranker** (bge-reranker-v2-m3) then reads the question with the best candidates and keeps the ones that truly answer it.
3. The chat model (Qwen3, Apache-2.0) answers **only from those passages and the project's own numbers**, citing them as [1], [2].
4. The answer is followed by its sources (with links) and by a warning listing any figure that appears in neither the sources nor the project facts.

What it reads (`datasets/knowledge/manifest.json` lists every source with its publisher, URL and status): the MIDH Operational Guidelines 2025, NHB cost norms and guidelines, the NCERT/PSSCIVE protected-cultivation textbook, TNAU crop guides and IPM schedule, plus the CSV datasets in `datasets/csv` and the planner's own cost model. Gaps are listed there too (for example, no official lettuce or NFT guide); the assistant is told to say so rather than guess. The downloaded text is git-ignored because some of it is copyrighted.

Speed and quality, measured on a 15 W laptop CPU (Intel Core 7 150U, no GPU): the default Qwen3-4B model takes about 50 to 90 seconds for a full answer; the project facts are cached after the first question. A faster CPU or `LLM_GPU=auto` on a real GPU helps a lot. The 4B was chosen over the 1.7B after a 66-question evaluation (`datasets/eval/assistant-questions.json`): it reads the right passage more often, keeps to the rules and writes usable Hindi and Marathi. The 1.7B (`LLM_MODEL_URI`, see `backend/.env.example`) is about 1.8x faster. Always check important figures with the cited source or a local expert.

To measure the assistant after changing retrieval, prompts or the model: `cd backend && npm run eval:assistant` (91 questions with known answers, including "what if" questions answered by the planner; well over an hour on a laptop CPU, or `-- --only=id1,id2` for a few).

## Testing & CI

```sh
npm test                  # unit + integration tests (vitest, frontend and backend API)
npm run test:coverage     # same, with coverage report in coverage/ and enforced floors
npm run test:e2e          # end-to-end browser tests (Playwright); runs against an in-memory Postgres (PGlite), no setup needed
npm run test:e2e:scene    # the long 3D sweep: every setup option in the viewer (its own CI workflow)
npm run lint              # eslint
npm run typecheck         # strict TypeScript
npm run ci                # lint + types + coverage + build, exactly as CI runs it
```

- **Unit/integration** (`src/test/`): calculations, validators, finance, services, auth and AI
  routes and retrieval (the language model is faked), PDF/Excel builders, and React pages and panels.
- **End-to-end** (`e2e/`): sign-up, password reset, the full workspace journey, real PDF/Excel
  downloads, saved-setup comparison, share links and mobile. It starts its own servers on ports
  5390/5391 and uses a throwaway in-memory database (override with `E2E_DATABASE_URL`).
  On a fresh machine run `npm run test:e2e:install` once to download Chromium.
- **CI** (`.github/workflows/ci.yml`): on every push and pull request GitHub Actions runs the
  quality checks, the e2e suite, and a dependency audit. The 3D sweep (`scene-e2e.yml`) runs when the
  3D code changes, weekly and on demand: CI runners have no GPU, so WebGL is drawn on the CPU and the
  sweep takes over half an hour.

## Production notes

- Set `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `DATABASE_URL` (the Supabase connection string) and `CORS_ORIGINS` in `backend/.env`; the API refuses to start without them. Password-reset emails are sent by Supabase Auth, so set Resend as its SMTP provider in the dashboard.
- Generated PDF reports are always in English, because jsPDF cannot render Devanagari text.
