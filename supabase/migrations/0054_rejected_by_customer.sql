-- =============================================================================
-- 0054_rejected_by_customer.sql — the customer refused the parcel at the door
--
-- The rider arrived and the customer would not take it: changed their mind,
-- no cash for the COD, or it turned out not to be the person who ordered. The
-- order closes as a lost sale and joins the RTS losses — but, like a blocked
-- customer, not the RTS rate. The courier did its job; the sale still died.
-- =============================================================================

-- Distinct from 'returned', which says only that a parcel came back, and from
-- 'blocked', which says we never reached the customer at all. This one says
-- the customer was reached, was handed the parcel, and said no.
--
-- Worth its own status rather than a note on a return, because the remedy is
-- different: a returned parcel is often an address to fix and reship, while a
-- refusal is a customer to talk to before anything ships again.
insert into order_statuses (code, label, sort_order, is_terminal, public_helper)
values (
  'rejected',
  'Rejected by Customer',
  11,
  true,
  'This delivery was refused. Please message our page if you still need your '
  'document and we will arrange it again.'
)
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      public_helper = excluded.public_helper;

alter table orders
  add column if not exists rejected_at timestamptz;

comment on column orders.rejected_at is
  'When the customer refused the parcel at the door — would not accept it, or '
  'would not pay the COD. Counts as a loss like a return, but never against a '
  'courier: the delivery itself succeeded.';

-- The forward pipeline the customer sees: four endings are off it now.
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
   where code not in ('cancelled', 'returned', 'blocked', 'rejected');
$function$;

-- --- When an order was lost, by the way it was lost ------------------------
--
-- Replaces the coalesce(returned_at, blocked_at) the earlier migrations used.
-- That read the wrong date for an order that had been returned once and was
-- later written off some other way: returned_at is never cleared, so the
-- coalesce kept answering with the old return. Keying off the status the
-- order actually holds cannot drift that way.
create or replace function public.order_lost_at(
  p_status text,
  p_returned_at timestamptz,
  p_blocked_at timestamptz,
  p_rejected_at timestamptz
)
returns timestamptz
language sql
immutable
as $function$
  select case p_status
           when 'returned' then p_returned_at
           when 'blocked'  then p_blocked_at
           when 'rejected' then p_rejected_at
         end;
$function$;

-- Every status that means the money is gone.
create or replace function public.lost_statuses()
returns text[]
language sql
immutable
as $function$
  select array['returned', 'blocked', 'rejected']::text[];
$function$;

-- --- Losses: a refused parcel costs the same as a returned one -------------
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
  -- Lost: came back from the courier, written off because the customer became
  -- unreachable, or refused at the door. Same hole in the same pocket.
  returned as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = any (public.lost_statuses())
       and public.order_lost_at(status, returned_at, blocked_at, rejected_at)::date
           between p_from and p_to
       and merged_into is null
  ),
  returned_docs as (
    select coalesce(sum(oi.quantity), 0) docs
      from orders o
      join order_items oi on oi.order_id = o.id
     where o.status = any (public.lost_statuses())
       and public.order_lost_at(o.status, o.returned_at, o.blocked_at, o.rejected_at)::date
           between p_from and p_to
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
  -- Deliberately still 'returned' only. This is the courier's failure rate.
  -- A customer who blocked us never saw a rider, and a customer who refused
  -- the parcel saw one who turned up — neither is the courier failing.
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
           public.order_lost_at(o.status, o.returned_at, o.blocked_at,
                                o.rejected_at) as lost_at,
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
            where status = any (public.lost_statuses())
              and lost_at::date between p_from and p_to), 0),
        'rts_count', count(*) filter (
            where status = any (public.lost_statuses())
              and lost_at::date between p_from and p_to),
        'rts_docs', coalesce(sum(quantity) filter (
            where status = any (public.lost_statuses())
              and lost_at::date between p_from and p_to), 0),
        'rts_loss_amount', coalesce(sum(quantity) filter (
            where status = any (public.lost_statuses())
              and lost_at::date between p_from and p_to), 0)
            * (select per_doc from cost)
      ) as row
      from item_amounts
      group by id, name
    ) t;
$function$;

-- The loss list, now carrying all three kinds. Each is flagged so the board
-- can name how the sale died: the remedy differs — fix the address and
-- reship, chase a customer who vanished, or talk to one who said no.
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
           'returned_at', public.order_lost_at(o.status, o.returned_at,
                                               o.blocked_at, o.rejected_at),
           'blocked', o.status = 'blocked',
           'rejected', o.status = 'rejected'
         ) order by public.order_lost_at(o.status, o.returned_at, o.blocked_at,
                                         o.rejected_at) desc), '[]'::json)
    from orders o
    join customers cu on cu.id = o.customer_id
    left join couriers c on c.id = o.courier_id
    left join lateral (
      select sum(oi.quantity) docs from order_items oi where oi.order_id = o.id
    ) d on true
   where o.status = any (public.lost_statuses())
     and public.order_lost_at(o.status, o.returned_at, o.blocked_at,
                              o.rejected_at)::date between p_from and p_to
     and o.merged_into is null;
$function$;
