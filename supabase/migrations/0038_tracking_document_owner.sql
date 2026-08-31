-- =============================================================================
-- 0038_tracking_document_owner.sql — whose document is whose (§7)
--
-- The tracking page named the documents and nothing else, so an order for two
-- birth certificates read "your PSA Birth Certificate, PSA Birth Certificate
-- order". True, and useless: the customer cannot tell which is which, and
-- combining orders makes that the normal case rather than a rare one.
--
-- So each document is now named with the person it is for. That name is
-- already on the form — it is what gets typed onto the PSA sheet — and it is
-- the only thing that distinguishes one certificate from another on an order.
-- A marriage certificate names the couple, since it belongs to both.
--
-- The owner is composed here rather than the form details being handed out:
-- this endpoint is public, reachable with a tracking code alone, and the
-- parents' names, birthdates and places of birth beside it are nobody's
-- business but the customer's.
-- =============================================================================

create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  documents_json json;
  courier_json  json;
  history_json  json;
  messenger_json json;
  st            order_statuses%rowtype;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;
  end if;

  -- This order was combined into another. Follow the pointer once, so the code
  -- the customer saved shows the parcel their documents are actually in.
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

  -- Each document, with the person named on it. Every template but one holds
  -- that as first/middle/last; a marriage certificate belongs to two people,
  -- so it carries both. A document not filled in yet simply has no name to
  -- show, and falls back to what it is.
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
