-- =============================================================================
-- 0036_combine_orders.sql — two orders, one parcel, one tracking link (§4, §7)
--
-- The same person orders a death certificate on Monday and another on Friday.
-- Two orders, two tracking codes, two parcels — but one processor, one trip to
-- the PSA and one shipment. The office wants them as one job, and the customer
-- wants one link to watch.
--
-- Combining moves the documents onto the earliest of the selected orders and
-- points the others at it. They are not deleted: the customer already has
-- those links, and a link that answers "not found" is worse than no link. Each
-- absorbed code keeps working and now shows the combined order, so whichever
-- one they saved is the right one.
--
-- The absorbed rows keep their history and their place in the ledger, but they
-- no longer carry documents or money — everything moved — so they drop out of
-- the board, the queue and the per-service table on their own. Only the order
-- counts needed telling.
-- =============================================================================

alter table orders
  add column if not exists merged_into uuid references orders(id) on delete set null;

create index if not exists orders_merged_into_idx on orders (merged_into)
  where merged_into is not null;

comment on column orders.merged_into is
  'Set when this order was combined into another. Its documents moved there; '
  'its tracking code still works and now follows the combined order.';

-- An order cannot be combined into itself, and a combined order cannot itself
-- absorb others — one hop, so a tracking code never chases a chain.
alter table orders drop constraint if exists orders_merged_into_not_self;
alter table orders add constraint orders_merged_into_not_self
  check (merged_into is null or merged_into <> id);

-- --- Counting -----------------------------------------------------------------
-- Booked money is unaffected: an absorbed order's items moved, so its total is
-- already zero. Its *count* is not, and "56 orders encoded" should not grow by
-- one every time two are combined into one job.
create or replace function public.sales_summary(p_from date, p_to date)
returns json
language sql
stable
as $$
  with booked as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt,
           coalesce(sum(discount_amount), 0) disc,
           count(*) filter (where discount_amount > 0) disc_cnt
      from orders
     where created_at::date between p_from and p_to
       and status <> 'cancelled'
       and merged_into is null
  ),
  collected as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'delivered'
       and payment_status = 'paid'
       and delivered_at::date between p_from and p_to
       and merged_into is null
  ),
  returned as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'returned'
       and returned_at::date between p_from and p_to
       and merged_into is null
  ),
  returned_docs as (
    select coalesce(sum(oi.quantity), 0) docs
      from orders o
      join order_items oi on oi.order_id = o.id
     where o.status = 'returned'
       and o.returned_at::date between p_from and p_to
  ),
  cancelled as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'cancelled'
       and cancelled_at::date between p_from and p_to
       and merged_into is null
  ),
  shipped as (
    select count(*) cnt
      from orders
     where shipped_at is not null
       and shipped_at::date between p_from and p_to
       and merged_into is null
  ),
  shipped_returned as (
    select count(*) cnt
      from orders
     where status = 'returned'
       and shipped_at is not null
       and shipped_at::date between p_from and p_to
       and merged_into is null
  )
  select json_build_object(
    'booked_amount',        (select amt from booked),
    'booked_count',         (select cnt from booked),
    'discount_amount',      (select disc from booked),
    'discount_count',       (select disc_cnt from booked),
    'collected_amount',     (select amt from collected),
    'collected_count',      (select cnt from collected),
    'rts_amount',           (select amt from returned),
    'rts_count',            (select cnt from returned),
    'rts_docs',             (select docs from returned_docs),
    'rts_cost_per_doc',     public.rts_cost_per_doc(),
    'rts_loss_amount',      (select docs from returned_docs) * public.rts_cost_per_doc(),
    'cancelled_amount',     (select amt from cancelled),
    'cancelled_count',      (select cnt from cancelled),
    'net_amount', (select amt from booked) - (select amt from returned),
    'net_after_rts_cost', (select amt from booked)
                  - (select amt from returned)
                  - (select docs from returned_docs) * public.rts_cost_per_doc(),
    'shipped_count',        (select cnt from shipped),
    'shipped_returned_count', (select cnt from shipped_returned),
    'rts_rate', case when (select cnt from shipped) = 0 then 0
                     else round(
                       (select cnt from shipped_returned)::numeric
                       * 100 / (select cnt from shipped), 1)
                end
  );
$$;

-- --- The customer's link ------------------------------------------------------
-- Whichever of the two codes they kept, it answers with the combined order.
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

-- --- A document that changes hands --------------------------------------------
-- Combining is the first thing that moves an item from one order to another,
-- and the totals trigger was not written for it: it recomputed the order the
-- item landed on and left the one it came from holding the money for a
-- document it no longer has. Both ends are recomputed now.
create or replace function order_items_touch_total() returns trigger
language plpgsql as $$
begin
  perform recalc_order_total(coalesce(new.order_id, old.order_id));
  if tg_op = 'UPDATE' and old.order_id is distinct from new.order_id then
    perform recalc_order_total(old.order_id);
  end if;
  return null;
end;
$$;
