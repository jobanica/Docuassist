-- =============================================================================
-- 0053_blocked_by_customer.sql — writing off an order the customer walked away from
--
-- Staff press "Blocked" on an order whose document is already filed and paid
-- for, when the customer has blocked us on Messenger or otherwise gone
-- unreachable. It closes as a lost sale and joins the RTS losses — but not the
-- RTS rate, which belongs to the courier.
-- =============================================================================

-- A customer who blocks us after the document is already paid for and filed.
--
-- The money is gone exactly as it is on a return: the PSA fee was spent the
-- moment the request was encoded, and no revenue arrives. What is different is
-- that no courier was ever involved, so this must NOT land in the RTS rate or
-- the per-courier table — blaming J&T for a customer who stopped answering
-- would quietly make a good courier look bad.
--
-- So: its own terminal status, counted in the loss money, left out of the
-- delivery-failure rates.
insert into order_statuses (code, label, sort_order, is_terminal, public_helper)
values (
  'blocked',
  'Blocked by Customer',
  10,
  true,
  'We could not reach you to complete this order. Please message our page if '
  'you still need your document.'
)
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      public_helper = excluded.public_helper;

alter table orders
  add column if not exists blocked_at timestamptz;

comment on column orders.blocked_at is
  'When the order was written off because the customer became unreachable — '
  'blocked us on Messenger, changed number, stopped replying. Counts as a loss '
  'like a return, but never against a courier.';

-- The forward pipeline the customer sees: three endings are off it now.
create or replace function public.get_public_pipeline()
returns json
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(
           json_agg(json_build_object('code', code, 'label', label)
                    order by sort_order),
           '[]'::json)
    from order_statuses
   where code not in ('cancelled', 'returned', 'blocked');
$function$;

-- --- Losses: a blocked order costs the same as a returned one --------------
create or replace function public.sales_summary(p_from date, p_to date)
returns json
language sql
stable
as $function$
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
  -- Lost: came back from the courier, or written off because the customer
  -- became unreachable. Same hole in the same pocket.
  returned as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status in ('returned', 'blocked')
       and coalesce(returned_at, blocked_at)::date between p_from and p_to
       and merged_into is null
  ),
  returned_docs as (
    select coalesce(sum(oi.quantity), 0) docs
      from orders o
      join order_items oi on oi.order_id = o.id
     where o.status in ('returned', 'blocked')
       and coalesce(o.returned_at, o.blocked_at)::date between p_from and p_to
       and o.merged_into is null
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
  -- Deliberately still 'returned' only. This is the courier's failure rate,
  -- and a customer who blocked us is not the courier's failure.
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
$function$;

create or replace function public.sales_by_service(p_from date, p_to date)
returns json
language sql
stable
as $function$
  with cost as (select public.rts_cost_per_doc() per_doc),
  verify as (select public.id_verification_fee() fee),
  item_amounts as (
    select s.id, s.name,
           o.status, o.payment_status,
           o.created_at, o.delivered_at,
           coalesce(o.returned_at, o.blocked_at) as lost_at,
           oi.quantity,
           case when sub.subtotal > 0
                then gross.amt
                     - least(o.discount_amount, sub.subtotal)
                       * gross.amt / sub.subtotal
                else 0
           end as amount
      from order_items oi
      join services s on s.id = oi.service_id
      join orders   o on o.id = oi.order_id
      join lateral (
        select oi.price_at_order * oi.quantity
               + case when oi.form_details->>'account_type' = 'existing_unknown'
                      then (select fee from verify) else 0 end as amt
      ) gross on true
      join lateral (
        select coalesce(sum(
                 x.price_at_order * x.quantity
                 + case when x.form_details->>'account_type' = 'existing_unknown'
                        then (select fee from verify) else 0 end
               ), 0) subtotal
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
            where status in ('returned', 'blocked')
              and lost_at::date between p_from and p_to), 0),
        'rts_count', count(*) filter (
            where status in ('returned', 'blocked')
              and lost_at::date between p_from and p_to),
        'rts_docs', coalesce(sum(quantity) filter (
            where status in ('returned', 'blocked')
              and lost_at::date between p_from and p_to), 0),
        'rts_loss_amount', coalesce(sum(quantity) filter (
            where status in ('returned', 'blocked')
              and lost_at::date between p_from and p_to), 0)
            * (select per_doc from cost)
      ) as row
      from item_amounts
      group by id, name
    ) t;
$function$;

-- The loss list itself, now carrying both kinds with a flag to tell them
-- apart — the remedy is different (chase the address vs. write it off).
create or replace function public.returned_orders(p_from date, p_to date)
returns json
language sql
stable
as $function$
  with cost as (select public.rts_cost_per_doc() per_doc)
  select coalesce(json_agg(json_build_object(
           'order_id', o.id,
           'tracking_code', o.tracking_code,
           'customer_name', cu.full_name,
           'city', cu.city,
           'courier_name', c.name,
           'total_amount', o.total_amount,
           'docs', coalesce(d.docs, 0),
           'loss_amount', coalesce(d.docs, 0) * (select per_doc from cost),
           'delivery_attempts', o.delivery_attempts,
           'return_reason', o.return_reason,
           'returned_at', coalesce(o.returned_at, o.blocked_at),
           'blocked', o.status = 'blocked'
         ) order by coalesce(o.returned_at, o.blocked_at) desc), '[]'::json)
    from orders o
    join customers cu on cu.id = o.customer_id
    left join couriers c on c.id = o.courier_id
    left join lateral (
      select sum(oi.quantity) docs from order_items oi where oi.order_id = o.id
    ) d on true
   where o.status in ('returned', 'blocked')
     and coalesce(o.returned_at, o.blocked_at)::date between p_from and p_to
     and o.merged_into is null;
$function$;
