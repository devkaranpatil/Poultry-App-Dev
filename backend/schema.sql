-- Generic PostgreSQL schema for greenhouse configurations (no Supabase dependencies)
create extension if not exists "pgcrypto";

create table if not exists greenhouse_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  name text,
  location text not null,
  climate text not null,
  structure_type text not null,
  cover_material text not null,
  length numeric,
  width numeric,
  height numeric,
  area numeric,
  metadata jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
