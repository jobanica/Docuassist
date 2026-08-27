-- =============================================================================
-- 0007_public_business_info.sql — expose only the non-sensitive business
-- branding the public tracking page needs (name, Messenger link, logo).
-- app_settings itself stays staff-only under RLS; this whitelisted RPC is the
-- single anon-reachable path to these three keys.
-- =============================================================================
create or replace function public.get_public_business_info()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'business_name', coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
    'messenger_url', (select value from app_settings where key = 'messenger_url'),
    'logo_url', nullif((select value from app_settings where key = 'logo_url'), '')
  );
$$;

revoke all on function public.get_public_business_info() from public;
grant execute on function public.get_public_business_info() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Public, DB-driven pipeline stage labels for the tracking stepper. Returns the
-- six forward stages (excludes terminal cancelled/returned). No PII.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_pipeline()
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- The six forward stages new_inquiry..delivered (sort_order 1..6);
  -- terminal cancelled (7) and returned (8) are excluded.
  select coalesce(json_agg(json_build_object('code', code, 'label', label) order by sort_order), '[]'::json)
    from order_statuses
   where sort_order between 1 and 6;
$$;

revoke all on function public.get_public_pipeline() from public;
grant execute on function public.get_public_pipeline() to anon, authenticated, service_role;
