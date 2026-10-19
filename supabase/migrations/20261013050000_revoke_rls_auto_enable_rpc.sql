-- rls_auto_enable() is an event-trigger function (ensure_rls) that Supabase installs on hosted projects.
-- It must not be callable through the REST API (/rest/v1/rpc/rls_auto_enable) by anon or signed-in users.
-- It does not exist in a fresh or local Postgres, so only revoke when it is there.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
