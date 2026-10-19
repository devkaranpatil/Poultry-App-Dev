-- Initial schema: replaces the MongoDB collections (users, password_reset_tokens,
-- saved_configurations) and adds tables for the official reference datasets in datasets/csv.
--
-- The backend connects with a privileged database role (the Supabase connection string), which
-- bypasses row level security. RLS is still enabled everywhere so that the public Supabase API
-- (anon / authenticated roles) can never read or write user data by accident.

-- =====================================================================
-- Application tables
-- =====================================================================

create table public.app_users (
  id                  uuid primary key default gen_random_uuid(),
  name                text        not null,
  email               text        not null,
  password_hash       text,
  google_id           text,
  avatar_url          text,
  email_verified      boolean     not null default false,
  -- Epoch milliseconds; access tokens issued before this instant are revoked.
  password_changed_at bigint,
  created_at          timestamptz not null default now(),
  last_login_at       timestamptz,
  constraint app_users_has_sign_in_method check (password_hash is not null or google_id is not null)
);

create unique index app_users_email_key on public.app_users (lower(email));
create unique index app_users_google_id_key on public.app_users (google_id) where google_id is not null;

create table public.password_reset_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.app_users (id) on delete cascade,
  token_hash text        not null unique,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

create index password_reset_tokens_user_id_idx on public.password_reset_tokens (user_id);
create index password_reset_tokens_expires_at_idx on public.password_reset_tokens (expires_at);

create table public.saved_configurations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references public.app_users (id) on delete cascade,
  name            text        not null,
  normalized_name text        not null,
  config_type     text        not null default 'greenhouse' check (config_type in ('greenhouse', 'polyhouse')),
  config          jsonb       not null check (jsonb_typeof(config) = 'object'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint saved_configurations_user_name_key unique (user_id, normalized_name)
);

create index saved_configurations_user_updated_idx on public.saved_configurations (user_id, updated_at desc);

-- Mongo's TTL index removed expired reset tokens automatically; call this from a scheduled job
-- (Supabase: pg_cron) or rely on the backend, which also purges on every new token.
create function public.purge_expired_reset_tokens() returns integer
language sql as $$
  with removed as (
    delete from public.password_reset_tokens where expires_at < now() - interval '1 day' returning 1
  )
  select count(*)::integer from removed;
$$;

-- Supabase exposes public functions through its API; this one is for the backend / pg_cron only.
revoke execute on function public.purge_expired_reset_tokens() from public, anon, authenticated;

-- =====================================================================
-- Reference datasets (source: datasets/csv, see datasets/README.md)
-- =====================================================================

create table public.cost_norms (
  id                             bigint generated always as identity primary key,
  scheme                         text    not null,
  component                      text    not null,
  structure_type                 text    not null,
  cost_norm_inr                  numeric not null,
  unit                           text    not null,
  cost_norm_hilly_inr            numeric,
  pattern_of_assistance_verbatim text,
  source_document                text    not null,
  source_url                     text    not null,
  notes                          text
);

create table public.midh_area_limits (
  id              bigint generated always as identity primary key,
  scheme          text not null,
  rule            text not null,
  value           text not null, -- numeric in most rows but one reads "4000 and above"
  unit            text not null,
  effective_from  date not null,
  source_document text not null,
  source_url      text not null,
  notes           text
);

create table public.district_climate_monthly (
  state                 text    not null,
  district              text    not null,
  latitude              numeric not null,
  longitude             numeric not null,
  geocoder_matched_name text    not null,
  geonames_id           bigint  not null,
  elevation_m           numeric,
  month                 text    not null check (month in ('JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC','ANN')),
  t2m_mean_c            numeric,
  t2m_max_c             numeric,
  t2m_min_c             numeric,
  rh2m_pct              numeric,
  precip_mm_per_day     numeric,
  solar_mj_m2_per_day   numeric,
  wind_2m_m_per_s       numeric,
  primary key (state, district, month)
);

create table public.district_climate_unresolved (
  state    text not null,
  district text not null,
  reason   text not null,
  primary key (state, district)
);

-- =====================================================================
-- Row level security
-- =====================================================================

alter table public.app_users                   enable row level security;
alter table public.password_reset_tokens       enable row level security;
alter table public.saved_configurations        enable row level security;
alter table public.cost_norms                  enable row level security;
alter table public.midh_area_limits            enable row level security;
alter table public.district_climate_monthly    enable row level security;
alter table public.district_climate_unresolved enable row level security;

-- User data has no policies on purpose: only the backend's privileged connection can touch it.
revoke all on public.app_users, public.password_reset_tokens, public.saved_configurations from anon, authenticated;

-- Reference data is public information, so anyone may read it but nobody may change it via the API.
create policy "reference data is readable" on public.cost_norms                  for select to anon, authenticated using (true);
create policy "reference data is readable" on public.midh_area_limits            for select to anon, authenticated using (true);
create policy "reference data is readable" on public.district_climate_monthly    for select to anon, authenticated using (true);
create policy "reference data is readable" on public.district_climate_unresolved for select to anon, authenticated using (true);

revoke insert, update, delete on public.cost_norms, public.midh_area_limits,
  public.district_climate_monthly, public.district_climate_unresolved from anon, authenticated;
