# Poultry Planner (working name)

A planner for poultry farms in India: design a shed, see what it costs and earns, which schemes and loans apply, the
risks, and a bank-ready report. It was built from a complete polyhouse planner (the GreenhouseIQ project); the
polyhouse code is kept on the `polyhouse` git tag. The app name is a placeholder set in one place, `shared/app.json`,
which every screen, the page title, the report and the emails read.

**Migration status:** all seven phases are done (tags `phase-1` to `phase-7`). What is still open, including a full
run of the assistant evaluation, is in [docs/migration/remaining-work.md](docs/migration/remaining-work.md); the plan,
research and feature changes are in [docs/migration](docs/migration/README.md).

What it does:

- **Design** a poultry shed in 3D: size and heights, shed type (open-sided, environment-controlled with tunnel fans and
  cooling pads, or backyard), roof (gable, monitor, lean-to), frame, roof sheet, side walls and curtains, entry
  (door, footbath, anteroom), birds (broiler, layers in cages or on litter, improved desi) and feeding. The flock size
  follows from the floor area and the stocking density.
- **Cost** it from NABARD's 2023-24 unit costs (shed rate per sq ft, equipment per bird), with the first batch's
  working capital, compared with NABARD's unit cost for the same flock. Items without a published price are marked
  "verify".
- **Earnings:** batches a year (or the layer cycle), birds and eggs sold, feed, running costs, profit, payback and the
  break-even price, independent or on contract, from editable prices and norms that each show their source.
- **Schemes and loan:** which schemes can apply (NLM-EDP for rural poultry parent farms, AHIDF for feed and processing,
  state schemes) and why; when none applies the screens say so plainly, and the bank loan carries the project
  (margin, instalments, interest and the yearly debt cover).
- **Site and rules:** the CPCB consent and siting distances for farms above 5,000 birds, a checklist to confirm, and
  the district's heat stress months (NASA POWER climate).
- **Risk:** a Monte Carlo simulation of mortality, feed conversion, prices, build cost and the chance of an outbreak.
- **AI assistant** that runs on your own server and answers from official documents, with sources. "What if" questions
  (more birds, contract, layers, another shed, another price) are answered by the planner itself, so the figures come
  from code, shown as a now/with-the-change table.
- **Save, compare, share and export** (PDF and Excel with live formulas), in English, Hindi and Marathi.

The workspace is a guided journey of seven steps: **Design → Site & rules → Cost → Earnings → Loan → Risk → Report**.
- **Each step:** it answers one question, starts with an "In short" sentence built from your figures, and has Back and
  Next buttons.
- **Help where you need it:** a "?" beside a hard word explains it, and tables, statistics and sources sit under "Show
  details".
- **The advisor:** "Ask the advisor" opens the AI beside any step, with example questions for that step.
- **First visit:** a short guide explains it all and can start you from a recommended shed (14 x 7 m, about 1,050
  broilers).

More: [project status](docs/project-status.md), [backend architecture and audit](docs/backend-architecture.md),
[3D shed](docs/3d-scene.md), [what Indian sheds look like](docs/3d-model-references.md).

## Project layout

| Path | What it is |
|---|---|
| `src/` | React + Vite frontend (TypeScript, Three.js viewer) |
| `backend/` | Express API (calculations, auth, saved configurations) backed by Postgres (Supabase) |
| `shared/` | Data used by both sides: the app name, states and districts, the poultry norms and prices with their sources, and the shed limits |
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

The project advisor and the chat answer from **official documents**, using open-source models that run inside the
backend process (`node-llama-cpp`). Nothing is sent to an outside AI service.

```sh
cd backend && npm run models:download      # once, about 3 GB (chat model, embedding model, reranker)
python datasets/scripts/fetch_knowledge.py   # the official documents it reads (needs poppler's pdftotext, or: pip install pypdf)
```

`LLM_MODELS_DIR` points the backend at model files that are already on disk. Start the backend as usual. On the first
start it indexes the documents, which takes a few minutes and is then cached in `backend/.data/`. Until the models are
installed the AI features report "not configured" and everything else works.

How a question is answered:

1. A Hindi or Marathi question is put into English (the documents are English).
2. **Retrieval**: keyword search (BM25) and multilingual embeddings (bge-m3) each rank the passages; a **reranker**
   (bge-reranker-v2-m3) then reads the question with the best candidates and keeps the ones that truly answer it.
3. The chat model (Qwen3, Apache-2.0) answers **only from those passages and the project's own numbers**, citing them
   as [1], [2]. Subsidies come only from the planner's scheme check, never worked out by the model.
4. The answer is followed by its sources (with links) and by a warning listing any figure that appears in neither the
   sources nor the project facts.

What it reads (`datasets/knowledge/manifest.json` lists every source with its publisher, URL and status): the NLM-EDP
and AHIDF guidelines, NABARD's unit costs and its broiler, layer and indigenous poultry projects, the NCDC broiler
project report, the DAHD biosecurity guidelines, the TNAU poultry expert system (housing, broilers, layers, brooding,
litter, equipment, lighting, disease and vaccination, biosecurity) and the Vikaspedia broiler and layer pages, plus
the CSV tables in `datasets/csv` and the planner's own norms and cost items. Gaps are listed there too (for example,
no central capital subsidy for a plain broiler or layer farm, and medicine doses are for a veterinarian); the
assistant is told to say so rather than guess. The downloaded text is git-ignored because some of it is copyrighted.

Speed, measured on a 15 W laptop CPU (Intel Core 7 150U, no GPU): the default Qwen3-4B model takes about 40 to 90
seconds for a full answer; the project facts are cached after the first question. A faster CPU or `LLM_GPU=auto` on a
real GPU helps a lot. The 1.7B (`LLM_MODEL_URI`, see `backend/.env.example`) is about 1.8x faster but weaker.
Always check important figures with the cited source or a local expert.

To measure the assistant after changing retrieval, prompts or the model: `cd backend && npm run eval:assistant` (85
poultry questions with known answers, including "what if" questions answered by the planner; about an hour and a
half on a laptop CPU, or `-- --only=id1,id2` for a few). Run one evaluation at a time: two runs hold two copies of the
models and exhaust 16 GB of memory.

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

- **Unit/integration** (`src/test/`): poultry calculations (including the NABARD reproduction), validators, services, auth and AI
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
