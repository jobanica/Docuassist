-- =============================================================================
-- 0004_rpc_tracking.sql — public tracking lookup (§7, §13)
--   The ONLY anon-reachable data path. SECURITY DEFINER so it bypasses RLS,
--   but it hand-selects a strict whitelist. It NEVER returns address, barangay,
--   city, province, zip, phone, birthdate, parents' names, notes, form_details,
--   customer/order ids, or courier_tracking_number when no courier is set.
-- =============================================================================

create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  courier_json  json;
  history_json  json;
  st            order_statuses%rowtype;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;               -- caller renders the friendly not-found screen
  end if;

  select * into st from order_statuses where code = o.status;

  -- First name only (never the full name). §13
  select split_part(trim(c.full_name), ' ', 1) into first_name
    from customers c where c.id = o.customer_id;

  -- Service display names only (never form_details / document contents). §13
  select array_agg(s.name order by s.name) into service_names
    from order_items oi
    join services s on s.id = oi.service_id
   where oi.order_id = o.id;

  -- Courier block only when courier info exists (§7: hidden otherwise).
  if o.courier_id is not null then
    select json_build_object(
      'name', cr.name,
      'tracking_page_url', cr.tracking_page_url,
      'tracking_number', o.courier_tracking_number
    ) into courier_json
    from couriers cr where cr.id = o.courier_id;
  else
    courier_json := null;
  end if;

  -- History: status + date + event type/attempt/note. Notes here are staff
  -- transition notes and failed-attempt reasons — customer-safe per §7 (which
  -- explicitly shows failure reasons). PII lives on other tables, never here.
  select json_agg(json_build_object(
           'status', h.status,
           'label', hs.label,
           'event_type', h.event_type,
           'attempt_number', h.attempt_number,
           'note', h.note,
           'date', h.created_at
         ) order by h.created_at)
    into history_json
    from order_status_history h
    left join order_statuses hs on hs.code = h.status
   where h.order_id = o.id;

  return json_build_object(
    'tracking_code', o.tracking_code,
    'first_name', first_name,
    'service_names', coalesce(service_names, array[]::text[]),
    'status', o.status,
    'status_label', st.label,
    'status_sort_order', st.sort_order,
    'is_terminal', st.is_terminal,
    'public_helper', st.public_helper,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'courier', courier_json,
    'delivery_attempts', o.delivery_attempts,
    'expected_release_date', o.expected_release_date,
    'expected_delivery_date', o.expected_delivery_date,
    'shipped_at', o.shipped_at,
    'delivered_at', o.delivered_at,
    'returned_at', o.returned_at,
    'return_reason', o.return_reason,
    'history', coalesce(history_json, '[]'::json)
  );
end;
$$;

-- Anon may execute ONLY this function. No table grants to anon anywhere.
revoke all on function public.get_tracking_info(text) from public;
grant execute on function public.get_tracking_info(text) to anon, authenticated, service_role;
