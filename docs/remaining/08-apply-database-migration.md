# 08. Apply the poultry migration to the live database

**Status:** open. Needs the owner of the Supabase project.

## Why it is open

The database is shared with the polyhouse app, so changes to it were not applied automatically. Until the migration is
applied, **saving a setup fails on the live database**: the `config_type` check does not accept `poultry` yet.

The migration is additive: it widens `config_type` to accept `poultry` and adds the four `poultry_*` reference tables.
It does not change or delete anything the polyhouse app uses.

## What to do

1. Read `supabase/migrations/20261020020000_poultry_reference_data.sql`.
2. Apply it to the live project (Supabase dashboard SQL editor, or `supabase db push` with the project linked).
3. Load the poultry tables (only those; the polyhouse tables are that app's):

   ```
   node backend/scripts/loadReferenceData.js poultry
   ```

   It uses `DATABASE_URL` from `backend/.env`.

## Done when

- Saving a setup in the app works against the live database.
- `poultry_unit_costs` has 11 rows, `poultry_production_norms` 7, `poultry_scheme_rules` 3 and `poultry_siting_rules` 9.
- The polyhouse app still saves and lists its own setups.
