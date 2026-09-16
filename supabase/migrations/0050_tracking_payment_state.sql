-- =============================================================================
-- 0050_tracking_payment_state.sql — tell the customer where their money stands
--
-- Someone who has already handed over money and hears nothing back reads it as
-- a scam far faster than they read a slow parcel that way. The tracking page
-- now answers the payment question too.
-- =============================================================================

-- The customer needs to know where their money stands, not just their parcel.
-- Three answers: nothing sent yet, sent and being checked, or turned down with
-- a reason they can act on. Whitelisted like everything else this returns —
-- no amounts beyond the total already shown, no receipt files.
create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  documents_json json;
  courier_json  json;
  history_json  json;
  messenger_json json;
  st            order_statuses%rowtype;
  base          json;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;
  end if;

  if o.merged_into is not null then
    select * into o from orders where id = o.merged_into;
    if not found then
      return null;
    end if;
  end if;

  select * into st from order_statuses where code = o.status;

  select split_part(trim(c.full_name), ' ', 1) into first_name
    from customers c where c.id = o.customer_id;

  select array_agg(s.name order by s.name) into service_names
    from order_items oi
    join services s on s.id = oi.service_id
   where oi.order_id = o.id;

  select json_agg(json_build_object(
           'service_name', s.name,
           'quantity',     oi.quantity,
           'owner_name', nullif(
             case
               when coalesce(oi.form_details->>'husband_last', '') <> ''
                 or coalesce(oi.form_details->>'wife_last', '') <> ''
               then concat_ws(' & ',
                      nullif(concat_ws(' ',
                        nullif(trim(oi.form_details->>'husband_first'), ''),
                        nullif(trim(oi.form_details->>'husband_last'),  '')), ''),
                      nullif(concat_ws(' ',
                        nullif(trim(oi.form_details->>'wife_first'), ''),
                        nullif(trim(oi.form_details->>'wife_last'),  '')), ''))
               else concat_ws(' ',
                      nullif(trim(oi.form_details->>'first_name'),  ''),
                      nullif(trim(oi.form_details->>'middle_name'), ''),
                      nullif(trim(oi.form_details->>'last_name'),   ''))
             end, '')
         ) order by s.name)
    into documents_json
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
    'documents', coalesce(documents_json, '[]'::json),
    'status', o.status,
    'status_label', st.label,
    'status_sort_order', st.sort_order,
    'is_terminal', st.is_terminal,
    'public_helper', st.public_helper,
    'total_amount', o.total_amount,
    'discount_amount', o.discount_amount,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'payment_submitted_at', o.payment_submitted_at,
    'payment_verified_at', o.payment_verified_at,
    'payment_rejected_reason', o.payment_rejected_reason,
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
$function$;
