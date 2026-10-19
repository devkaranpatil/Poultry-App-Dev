-- Supabase security advisor (function_search_path_mutable): pin the search_path so the function
-- cannot be redirected to a different schema. Already applied to the remote project.

create or replace function public.purge_expired_reset_tokens() returns integer
language sql
set search_path = ''
as $$
  with removed as (
    delete from public.password_reset_tokens where expires_at < now() - interval '1 day' returning 1
  )
  select count(*)::integer from removed;
$$;

revoke execute on function public.purge_expired_reset_tokens() from public, anon, authenticated;
