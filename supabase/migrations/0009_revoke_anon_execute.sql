-- =============================================================================
-- 0009_revoke_anon_execute.sql — tighten function EXECUTE grants for anon.
--
-- Two defaults conspire to make public functions anon-callable:
--   1. Postgres grants EXECUTE on new functions to PUBLIC.
--   2. Supabase's default privileges additionally grant them to anon.
-- A plain `revoke ... from public` misses (2); revoking only from anon misses
-- (1). This migration revokes from BOTH for every function anon should not
-- reach, then stops the defaults re-granting on future functions.
--
-- Nothing here was exploitable beforehand — the sales functions are SECURITY
-- INVOKER so RLS returned zeros to anon, and recalc_order_total's UPDATE
-- affected no rows under RLS (both verified against the live project). This is
-- defense in depth: those functions should not be reachable at all.
--
-- Anon keeps EXECUTE on exactly the four functions the public tracking page
-- needs: the three whitelisted read RPCs plus the rate limiter it calls first.
-- =============================================================================

do $$
declare
  fn record;
  keep constant text[] := array[
    'get_tracking_info',
    'get_public_business_info',
    'get_public_pipeline',
    'check_rate_limit'
  ];
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not (p.proname = any(keep))
  loop
    execute format('revoke all on function %s from anon', fn.sig);
    execute format('revoke all on function %s from public', fn.sig);
  end loop;
end $$;

-- Keep the four public functions explicitly granted (the loop above skips them,
-- but be explicit so intent survives future edits).
grant execute on function public.get_tracking_info(text)          to anon, authenticated, service_role;
grant execute on function public.get_public_business_info()       to anon, authenticated, service_role;
grant execute on function public.get_public_pipeline()            to anon, authenticated, service_role;
grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated, service_role;

-- Staff-facing functions stay available to signed-in staff (RLS still applies).
grant execute on function public.sales_summary(date, date)   to authenticated;
grant execute on function public.sales_rts_trend(int)        to authenticated;
grant execute on function public.sales_by_service(date, date) to authenticated;
grant execute on function public.sales_by_courier(date, date) to authenticated;
grant execute on function public.returned_orders(date, date)  to authenticated;
grant execute on function public.recalc_order_total(uuid)     to authenticated;
grant execute on function public.is_staff()                   to authenticated;
grant execute on function public.is_admin()                   to authenticated;

-- Stop the defaults from auto-granting EXECUTE to anon on future functions.
alter default privileges in schema public revoke execute on functions from anon;
