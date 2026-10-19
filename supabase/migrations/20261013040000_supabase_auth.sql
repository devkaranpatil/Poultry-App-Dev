-- Sign-in moves to Supabase Auth (auth.users). app_users becomes the app's profile table and is
-- linked to the Supabase user by auth_user_id. Passwords, Google ids and reset tokens now live in
-- Supabase, so the columns and table that held them are removed.

alter table public.app_users add column auth_user_id uuid;
create unique index app_users_auth_user_id_key on public.app_users (auth_user_id) where auth_user_id is not null;

alter table public.app_users drop constraint app_users_has_sign_in_method;
drop index if exists public.app_users_google_id_key;
alter table public.app_users
  drop column password_hash,
  drop column google_id,
  drop column password_changed_at;

drop function if exists public.purge_expired_reset_tokens();
drop table public.password_reset_tokens;
