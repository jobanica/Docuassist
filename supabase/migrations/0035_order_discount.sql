-- =============================================================================
-- 0035_order_discount.sql — a discount on an order (§8 money)
--
-- Regulars ask for one, and until now the only way to give it was to edit the
-- price on the document itself — which quietly rewrites what that document
-- costs on this order, so the per-service report then says the PSA birth
-- certificate earns ₱585 sometimes and ₱685 other times with nothing to say
-- why.
--
-- So the discount is its own figure on the order, with a reason beside it.
-- total_amount stays what it has always been — what the customer pays — since
-- every read path already trusts it: the tracking page, the COD reminder, the
-- SMS, the board, the dashboard. What changes is that it is now the items less
-- the discount.
-- =============================================================================

alter table orders
  add column if not exists discount_amount numeric(10,2) not null default 0
    check (discount_amount >= 0),
  add column if not exists discount_reason text;

comment on column orders.discount_amount is
  'Taken off this order''s items. total_amount is already net of it.';
comment on column orders.discount_reason is
  'Why it was given — "suki since 2024", "bulk of 3". Office-only.';

-- --- The total is the items, less the discount --------------------------------
create or replace function recalc_order_total(p_order_id uuid) returns void
language plpgsql as $$
begin
  update orders o
     set total_amount = greatest(
       coalesce((
         select sum(oi.price_at_order * oi.quantity)
           from order_items oi
          where oi.order_id = p_order_id
       ), 0) - o.discount_amount, 0)
   where o.id = p_order_id;
end;
$$;

-- Changing the discount has to move the total with it. A BEFORE trigger writes
-- into the row on its way through rather than issuing an update of its own,
-- which would fire this same trigger again.
create or replace function orders_touch_total() returns trigger
language plpgsql as $$
begin
  new.total_amount := greatest(
    coalesce((
      select sum(oi.price_at_order * oi.quantity)
        from order_items oi
       where oi.order_id = new.id
    ), 0) - new.discount_amount, 0);
  return new;
end;
$$;

drop trigger if exists orders_discount_total_bu on orders;
create trigger orders_discount_total_bu
  before update of discount_amount on orders
  for each row
  when (old.discount_amount is distinct from new.discount_amount)
  execute function orders_touch_total();

-- Bring existing rows in line. Every discount is zero today, so this is a
-- no-op that proves it: any row it moves would mean the totals were already
-- adrift from their items.
select recalc_order_total(id) from orders;

-- --- Reporting ----------------------------------------------------------------
-- Booked, collected, RTS and net all read total_amount, so they follow the
-- discount without being touched. Only two things need saying.

-- One: what was given away in the period, so "we started discounting" has a
-- figure against it rather than a feeling.
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
  ),
  collected as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'delivered'
       and payment_status = 'paid'
       and delivered_at::date between p_from and p_to
  ),
  returned as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'returned'
       and returned_at::date between p_from and p_to
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
  ),
  shipped as (
    select count(*) cnt
      from orders
     where shipped_at is not null
       and shipped_at::date between p_from and p_to
  ),
  shipped_returned as (
    select count(*) cnt
      from orders
     where status = 'returned'
       and shipped_at is not null
       and shipped_at::date between p_from and p_to
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
    -- Net = Booked − Returns. Cancellations are already out of Booked, and the
    -- discount is already out of every total_amount above.
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

-- Two: the per-service table adds up item prices, not order totals, so a
-- discount would go missing there and the table would out-earn the tile above
-- it. It is spread across the order's documents in proportion to their price —
-- ₱100 off an order of a ₱685 and a ₱315 takes ₱68.50 off the one and ₱31.50
-- off the other, so the columns still sum to Booked.
create or replace function public.sales_by_service(p_from date, p_to date)
returns json
language sql
stable
as $$
  with cost as (select public.rts_cost_per_doc() per_doc),
  item_amounts as (
    select s.id, s.name,
           o.status, o.payment_status,
           o.created_at, o.delivered_at, o.returned_at,
           oi.quantity,
           case when sub.subtotal > 0
                then (oi.price_at_order * oi.quantity)
                     - least(o.discount_amount, sub.subtotal)
                       * (oi.price_at_order * oi.quantity) / sub.subtotal
                else 0
           end as amount
      from order_items oi
      join services s on s.id = oi.service_id
      join orders   o on o.id = oi.order_id
      join lateral (
        select coalesce(sum(x.price_at_order * x.quantity), 0) subtotal
          from order_items x where x.order_id = o.id
      ) sub on true
  )
  select coalesce(json_agg(row order by (row->>'booked_amount')::numeric desc), '[]'::json)
    from (
      select json_build_object(
        'service_name', name,
        'booked_amount', coalesce(sum(amount) filter (
            where created_at::date between p_from and p_to
              and status <> 'cancelled'), 0),
        'booked_count', count(*) filter (
            where created_at::date between p_from and p_to
              and status <> 'cancelled'),
        'collected_amount', coalesce(sum(amount) filter (
            where status = 'delivered' and payment_status = 'paid'
              and delivered_at::date between p_from and p_to), 0),
        'rts_amount', coalesce(sum(amount) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to), 0),
        'rts_count', count(*) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to),
        'rts_docs', coalesce(sum(quantity) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to), 0),
        'rts_loss_amount', coalesce(sum(quantity) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to), 0)
            * (select per_doc from cost)
      ) as row
      from item_amounts
      group by id, name
    ) t;
$$;

-- --- The customer's own page --------------------------------------------------
-- Someone who was given ₱100 off should see the ₱100, not just a smaller
-- number than the one they were quoted. The reason stays on our side: it is
-- written for the office ("suki", "kilala ni ma'am"), not for them.
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
