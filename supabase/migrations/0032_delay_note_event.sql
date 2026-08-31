-- =============================================================================
-- 0032_delay_note_event.sql — record a delay in the order's history (§11)
--
-- 0031 wrote the supplier's delay into order_status_history so the office can
-- see when it was flagged and how the reason changed. It used a new event_type
-- the table's own check constraint does not allow, so the insert failed and
-- took the whole flag with it.
--
-- A delay is genuinely not a status change: the order is still Processing. So
-- the event type is added rather than the note being dressed up as one.
-- =============================================================================

alter table order_status_history
  drop constraint if exists order_status_history_event_type_check;
alter table order_status_history
  add constraint order_status_history_event_type_check
  check (event_type in ('status_change', 'failed_attempt',
                        'backward_correction', 'note'));

-- The customer already gets the delay as its own banner, from delay_reason.
-- Repeating it in the timeline would say the same thing twice, so notes stay
-- on the office's side of the whitelist.
create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  courier_json  json;
  history_json  json;
  messenger_json json;
  st            order_statuses%rowtype;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;
  end if;

  select * into st from order_statuses where code = o.status;

  select split_part(trim(c.full_name), ' ', 1) into first_name
    from customers c where c.id = o.customer_id;

  select array_agg(s.name order by s.name) into service_names
    from order_items oi
    join services s on s.id = oi.service_id
   where oi.order_id = o.id;

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

  messenger_json := resolve_messenger_page(o.messenger_page_id);

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
   where h.order_id = o.id
     and h.event_type <> 'note';

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
    'is_delayed', o.delayed_at is not null,
    'delayed_at', o.delayed_at,
    'delay_reason', o.delay_reason,
    'messenger', messenger_json,
    'history', coalesce(history_json, '[]'::json)
  );
end;
$$;

grant execute on function public.get_tracking_info(text) to anon, authenticated, service_role;
