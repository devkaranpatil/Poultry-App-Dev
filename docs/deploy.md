# Deploying for free

The whole app on free tiers, for a first launch: the frontend on Cloudflare Pages, the API and the AI on an Oracle
Cloud Always Free ARM server in Hyderabad, the database and login on Supabase (already in use), and the API's
address from DuckDNS with HTTPS by Caddy. Chosen on 2026-11-08; prices and limits were checked that day.

| Part | Where | Cost |
|---|---|---|
| Frontend (`npm run build`, static) | Cloudflare Pages, `<project>.pages.dev` | free, commercial use allowed, no bandwidth cap |
| API and AI (`backend/`) | Oracle Cloud Always Free, Ampere A1: 2 OCPU, 12 GB, Ubuntu 24.04, Hyderabad | free |
| Address and HTTPS for the API | DuckDNS subdomain, Caddy certificate | free |
| Database and login | Supabase free project (the existing one) | free |

## What the free setup costs in other ways

- **AI answers are slow:** two ARM cores take minutes per answer (a laptop's 15 W CPU takes 40-90 s). Every other
  feature is unaffected. The search falls back to keywords when it runs past its time limits, which are raised below.
- **Oracle:** Always Free resources exist only in the home region chosen at sign-up (pick Hyderabad: Mumbai often has
  no free ARM capacity). Sign-up asks for a card to verify identity. Oracle's policy allows it to reclaim Always Free
  instances that stay idle; check the current terms when you sign up.
- **Supabase free:** a project pauses after a week without activity, and its built-in email sender has a very low
  hourly limit. Set up Resend as SMTP (free tier, needs a domain of your own) before inviting many users.
- **Addresses:** `*.pages.dev` and `*.duckdns.org` until a domain is bought. A domain is the first thing worth paying
  for (it also unlocks Resend email).

## Checklist (status 2026-11-08: prepared, not deployed)

Done already: the code, scripts and this guide are on `main`; an SSH key for the server exists on the owner's laptop
at `~/.ssh/kukkut_oracle` (public key `~/.ssh/kukkut_oracle.pub`, comment `kukkut-oracle`). Left, in order:

- [ ] Oracle Cloud account, home region **India South (Hyderabad)** (step 1)
- [ ] The server: Ubuntu 24.04, VM.Standard.A1.Flex, 2 OCPU, 12 GB, 50 GB disk; paste the contents of
      `~/.ssh/kukkut_oracle.pub` as its SSH key; note its public IP (step 2)
- [ ] Ingress rules for TCP 80 and 443 in the subnet's security list (step 2)
- [ ] DuckDNS subdomain pointing at the public IP, for example `kukkut-api.duckdns.org` (step 1 and 2)
- [ ] Log in: `ssh -i ~/.ssh/kukkut_oracle ubuntu@<server-ip>`, then run `setup.sh` (step 3)
- [ ] Copy the documents and the search cache, with `-i ~/.ssh/kukkut_oracle` on each `scp` (step 4)
- [ ] `backend/.env` on the server: take `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and `DATABASE_URL` from this
      laptop's `backend/.env` (never commit them), add the production values in step 4, then start the service
- [ ] Cloudflare Pages project from the GitHub repo, with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from
      this laptop's `.env` and `VITE_API_BASE_URL` set to the DuckDNS address (step 5)
- [ ] `CORS_ORIGINS` on the server set to the `pages.dev` address once Cloudflare gives it; restart the service
- [ ] Supabase sign-in URLs for the `pages.dev` address (step 6)
- [ ] The launch checks (step 7)

## 1. Accounts

1. **Oracle Cloud**: sign up, home region **India South (Hyderabad)**.
2. **Cloudflare**: sign up (Pages is under Workers & Pages).
3. **DuckDNS** (duckdns.org): sign in, create a subdomain, for example `poultry-planner-api`. Keep the token.

## 2. The Oracle server

1. Compute > Instances > Create instance.
   - Image: **Canonical Ubuntu 24.04** (aarch64).
   - Shape: **VM.Standard.A1.Flex**, 2 OCPU, 12 GB memory ("Always Free-eligible").
   - Networking: create a VCN with a public subnet, assign a public IPv4 address.
   - Add your SSH public key. Boot volume: 50 GB (Always Free covers up to 200 GB in total).
2. If it says "out of host capacity", try again later or another availability domain.
3. Networking > the VCN > the subnet's security list > add ingress rules for TCP **80** and **443** from `0.0.0.0/0`.
4. In DuckDNS, set your subdomain's IP to the instance's public IP.

## 3. Set up the server

```sh
ssh ubuntu@<server-ip>
git clone https://github.com/devkaranpatil/Poultry-App-Dev.git /tmp/poultry
DOMAIN=poultry-planner-api.duckdns.org bash /tmp/poultry/deploy/oracle/setup.sh
```

`setup.sh` installs Node.js 20, git and Caddy, opens ports 80 and 443 in the server's own firewall, clones the app to
`/opt/poultry`, installs the backend, downloads the AI models (about 3.2 GB) and installs the `poultry-api` service.

## 4. Documents, search cache and settings

The official documents are not in git (some are copyrighted), and indexing them on two cores is slow. Copy both from
the laptop that already has them, from the project folder:

```sh
scp -r datasets/knowledge/text ubuntu@<server-ip>:/opt/poultry/datasets/knowledge/
scp backend/.data/rag-embeddings.json ubuntu@<server-ip>:/opt/poultry/backend/.data/
```

Then on the server, `nano /opt/poultry/backend/.env` and set:

```sh
NODE_ENV=production
PORT=5000
CORS_ORIGINS=https://<project>.pages.dev
# Supabase > Project Settings > Database > Connection string > Session pooler
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable key>
# Two cores: use both, and give the document search longer before it falls back to keywords.
LLM_THREADS=2
RAG_EMBED_TIMEOUT_MS=60000
RAG_RERANK_TIMEOUT_MS=180000
```

Optionally `DATABASE_SSL_CA` (see `backend/.env.example`). For faster but weaker answers, `LLM_MODEL_URI` can point to
Qwen3-1.7B (also in `.env.example`); the evaluation score of 78/85 was measured with the default Qwen3-4B.

Start it and check:

```sh
sudo systemctl start poultry-api
journalctl -u poultry-api -f           # watch it load the models; Ctrl+C to stop watching
curl https://poultry-planner-api.duckdns.org/api/health
```

## 5. Cloudflare Pages (frontend)

Workers & Pages > Create > Pages > Connect to Git > `devkaranpatil/Poultry-App-Dev`, branch `main`.

| Setting | Value |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Environment variables | `NODE_VERSION=20`, `VITE_API_BASE_URL=https://poultry-planner-api.duckdns.org`, `VITE_SUPABASE_URL=https://<project-ref>.supabase.co`, `VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key>` |

`public/_redirects` sends every path to `index.html`, so links such as `/estimate` and `/visualizer?step=cost` open
directly. Each push to `main` redeploys the frontend.

## 6. Supabase

Authentication > URL Configuration: Site URL `https://<project>.pages.dev`; Redirect URLs
`https://<project>.pages.dev/oauth/google/callback` and `https://<project>.pages.dev/reset-password`. Google sign-in and
SMTP as in `backend/.env.example`.

## 7. Check the launch

- `https://<project>.pages.dev` loads; `/estimate` gives a result without an account.
- Sign up, design the recommended shed, open Cost: the figures and "Up to date" appear.
- Ask the advisor a question on Cost and wait for the answer (minutes on this server).
- Reset a password: the email arrives (watch the Supabase email limit).

## Updating

Frontend: push to `main`. API: on the server, `bash /opt/poultry/deploy/oracle/update.sh`.
