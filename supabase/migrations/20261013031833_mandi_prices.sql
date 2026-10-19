-- Daily mandi (wholesale market) prices from the official data.gov.in / Agmarknet dataset
-- "Current Daily Price of Various Commodities from Various Markets (Mandi)".
--
-- The source publishes a snapshot per day, not history, so rows accumulate: run the ingest
-- (backend/scripts/ingestMandiPrices.js) daily and re-running the same day is safe (upsert).
-- Prices are stored exactly as published (Agmarknet reports Rs per quintal).

create table public.mandi_prices_daily (
  id           bigint generated always as identity primary key,
  state        text        not null,
  district     text        not null,
  market       text        not null,
  commodity    text        not null,
  variety      text        not null default '',
  grade        text        not null default '',
  arrival_date date        not null,
  min_price    numeric,
  max_price    numeric,
  modal_price  numeric,
  fetched_at   timestamptz not null default now(),
  constraint mandi_prices_daily_key unique (state, district, market, commodity, variety, grade, arrival_date)
);

create index mandi_prices_daily_commodity_date_idx on public.mandi_prices_daily (commodity, arrival_date desc);

alter table public.mandi_prices_daily enable row level security;

-- Public information: readable through the API, writable only by the backend's privileged connection.
create policy "reference data is readable" on public.mandi_prices_daily for select to anon, authenticated using (true);
revoke insert, update, delete on public.mandi_prices_daily from anon, authenticated;
