-- Poultry reference data (Phase 2 of docs/migration). Additive only: this database is shared with the
-- polyhouse planner, so nothing it uses is renamed or dropped. The four tables mirror datasets/csv and are
-- filled by backend/scripts/loadReferenceData.js (pass "poultry" to load only these).

create table public.poultry_unit_costs (
  id               bigint generated always as identity primary key,
  state            text    not null,
  year             text    not null,
  bird_type        text    not null,
  system           text    not null,
  birds            integer not null check (birds > 0),
  unit_cost_inr    numeric not null check (unit_cost_inr > 0),
  repayment_years  integer,
  source_document  text    not null,
  source_url       text    not null,
  notes            text
);

create table public.poultry_production_norms (
  id                   bigint generated always as identity primary key,
  bird_type            text    not null,
  housing              text    not null,
  sqft_per_bird        numeric not null check (sqft_per_bird > 0),
  rearing_days         integer,
  cleaning_days        integer,
  mortality_pct        numeric,
  sale_weight_kg       numeric,
  feed_kg_per_bird     numeric,
  grower_weeks         integer,
  laying_weeks         integer,
  eggs_per_hen         integer,
  laying_mortality_pct numeric,
  fcr                  numeric,
  source_ids           text    not null,
  constraint poultry_production_norms_key unique (bird_type, housing)
);

create table public.poultry_scheme_rules (
  id                       bigint generated always as identity primary key,
  scheme_id                text    not null unique,
  scheme                   text    not null,
  state                    text,
  unit                     text    not null,
  percent_general          numeric,
  percent_sc_st            numeric,
  cap_inr                  numeric,
  min_own_contribution_pct numeric,
  min_parent_females       integer,
  min_parent_males         integer,
  greenfield_only          boolean not null,
  min_years_operation      integer,
  verified                 boolean not null,
  source_document          text    not null,
  source_url               text    not null,
  notes                    text
);

create table public.poultry_siting_rules (
  id                  bigint generated always as identity primary key,
  rule_id             text    not null unique,
  description         text    not null,
  distance_m          numeric,
  applies_above_birds integer not null,
  applies_to          text    not null,
  source_document     text    not null,
  source_url          text    not null
);

-- Public information: readable through the API, writable only by the backend's privileged connection.
alter table public.poultry_unit_costs       enable row level security;
alter table public.poultry_production_norms enable row level security;
alter table public.poultry_scheme_rules     enable row level security;
alter table public.poultry_siting_rules     enable row level security;

create policy "reference data is readable" on public.poultry_unit_costs       for select to anon, authenticated using (true);
create policy "reference data is readable" on public.poultry_production_norms for select to anon, authenticated using (true);
create policy "reference data is readable" on public.poultry_scheme_rules     for select to anon, authenticated using (true);
create policy "reference data is readable" on public.poultry_siting_rules     for select to anon, authenticated using (true);

revoke insert, update, delete on public.poultry_unit_costs, public.poultry_production_norms,
  public.poultry_scheme_rules, public.poultry_siting_rules from anon, authenticated;

-- Saved designs from the poultry planner. The polyhouse planner's own types stay valid.
alter table public.saved_configurations drop constraint if exists saved_configurations_config_type_check;
alter table public.saved_configurations
  add constraint saved_configurations_config_type_check check (config_type in ('greenhouse', 'polyhouse', 'poultry'));
