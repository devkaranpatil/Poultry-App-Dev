# Migrating from polyhouse planner to poultry farm planner

These documents plan the change of the app's topic from polyhouses (protected cultivation) to poultry farms. The components, the 3D editor, the step journey and the local AI all stay. Their content changes. Written 2026-10-19.

| Document | What it covers |
|---|---|
| [research.md](research.md) | The rules and figures: NLM-EDP, AHIDF, NABARD unit costs and model projects, IS 2732 and ICAR housing norms, CPCB siting, farm registration and biosecurity, price sources, heat stress. Each comes with its source, and unverified figures are marked |
| [feature-changes.md](feature-changes.md) | Every feature and what it becomes: setup fields, steps, schemes, cost, returns, risk, prices, 3D, AI, branding and storage |
| [implementation-plan.md](implementation-plan.md) | Eight phases with the files touched, tests and estimates (about 23 to 30 working days alone, about 15 with parallel agents), and the risks |
| [../remaining](../remaining/README.md) | What is left after the migration, one file per task: the full assistant evaluation, the faults it found, and the data and checks that need a person |

**Status (2026-10-20):** all phases are done and tagged (`phase-1` to `phase-7`); the polyhouse code is kept on the `polyhouse` tag. See [../remaining](../remaining/README.md) and [../project-status.md](../project-status.md).

## In one paragraph

Polyhouses had one clear scheme, MIDH, with NHB above 4,000 m². Poultry has no single equivalent.
- **NLM-EDP** gives 50% up to Rs 25 lakh, but only for a rural Low Input Technology parent farm and hatchery.
- **AHIDF** covers feed and processing plants, not farms.
- **State schemes** give 50% to 75% on fixed-size units.

The cost norms come from NABARD's yearly unit costs. For example, a 1,000-bird broiler unit costs Rs 5.94 lakh and a 5,000-bird cage layer unit Rs 32.1 lakh (Jharkhand, 2023-24). The app therefore:
- checks every scheme and says honestly when none applies
- uses NABARD costs the way it now uses MIDH norms
- adds what poultry needs and polyhouses didn't: flock size, a production model for broilers, layers and desi birds, contract farming, a siting and pollution checklist, biosecurity, and heat-stress advice

## Decisions needed

These should be settled before Phase 1 starts. The recommendation comes first.

1. **Name:** not chosen yet. Until then the app uses the placeholder "Poultry Planner" from one constant (`APP_NAME`).
   - Options: "Poultry IQ" (keeps the Greenhouse IQ pattern), "FlockPlan", "Kukkut Mitra" or your own.
   - The name appears in `index.html`, the Landing page, the logo, package names and the report.
2. **Bird types in v1:**
   - Recommended: broiler, layer (cage and floor), and coloured or desi birds.
   - Breeders and hatcheries can wait. They are needed only for the NLM parent-farm case, which can come in v1.1.
3. **Contract farming:** recommended **yes** in v1. It is how most Indian broiler farms run.
4. **Old saved polyhouse setups:**
   - Recommended: hide them, by marking them `domain = 'polyhouse'`, since the polyhouse app now lives on in its own repository (`polyhouse-final`).
   - Converting them makes no sense.
5. **States to cover first:**
   - Recommended: Maharashtra (its NABARD unit costs and state scheme), with Jharkhand's NABARD costs as the national fallback until other states are added.
6. **Keep the polyhouse app deployable?**
   - Settled: it lives on in its own repository.

## Before writing code

- Phase 0 is done: the polyhouse app is committed in its own repository, and this repository started fresh.
- Collect the missing sources in research.md section 7, above all current 2026 prices and the Maharashtra scheme GR. Every rate in the app must have a source or be marked unverified.

## Shared services to separate

- **Database:** `.env` and `backend/.env` were copied from the polyhouse repo, so both apps use the same Supabase project. Create a new Supabase project for this app before Phase 2's migration (`saved_configurations`, `scheme_rules`). Otherwise the database changes reach the polyhouse app too.
- **AI weights:** shared through `LLM_MODELS_DIR` (read-only use, safe to share).
