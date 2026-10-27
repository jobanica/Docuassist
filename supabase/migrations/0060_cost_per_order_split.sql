-- =============================================================================
-- 0060_cost_per_order_split.sql — stop charging one parcel's postage twice
--
-- 0028 priced everything per document: ₱443 each, being processing 205,
-- shipping 105, commission 33 and ad 100. Two of those four do not behave
-- per document at all.
--
--   An order for three certificates goes out as ONE parcel, so the courier
--   bills once, not three times. And one ad won that one order, not three.
--
-- On 51 multi-document orders that overstated cost by ₱12,614 — enough to
-- make a ₱1,385 three-certificate order look like ₱56 of profit when it
-- actually earned ₱466.
--
-- So the ₱443 splits by how each part is really incurred:
--
--   per document   processing 205 + commission 33 = 238
--   per order      shipping   105 + ad         100 = 205
--
--   cost = documents × 238 + orders × 205
--
-- A single-document order still costs 238 + 205 = ₱443, exactly as before, so
-- nothing moves for the 985 orders that carry one certificate. Only the 51
-- that carry more are repriced.
--
-- Applied everywhere the cost appears, not just the batch table: the headline
-- RTS loss, the per-service breakdown and the lost-orders list all charged
-- the same 443, and a dashboard that quotes two different costs for one
-- returned parcel is worse than one that quotes the wrong one consistently.
-- =============================================================================

-- --- The two halves, read from the same settings rows as before -------------
create or replace function public.cost_per_doc()
returns numeric
language sql
stable
as $function$
  select coalesce(sum(
           case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                then value::numeric else 0 end
         ), 0)
    from app_settings
   where key in ('rts_cost_processing', 'rts_cost_commission');
$function$;

comment on function public.cost_per_doc() is
  'The part of the cost each certificate carries: the PSA and encoder fee, '
  'and the agent commission. Multiplies with order_items.quantity.';

create or replace function public.cost_per_order()
returns numeric
language sql
stable
as $function$
  select coalesce(sum(
           case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                then value::numeric else 0 end
         ), 0)
    from app_settings
   where key in ('rts_cost_shipping', 'rts_cost_ad');
$function$;

comment on function public.cost_per_order() is
  'The part of the cost an order carries once however many certificates are '
  'in it: the courier bills per parcel, and one ad won the whole order.';

-- --- Headline figures -------------------------------------------------------
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
  -- Documents AND orders now, because the cost needs both.
  returned_docs as (
    select coalesce(sum(d.docs), 0) docs, count(*) orders
      from orders o
      join lateral (
        select coalesce(sum(oi.quantity), 0) docs
          from order_items oi where oi.order_id = o.id
      ) d on true
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
  ),
  loss as (
    select (select docs from returned_docs) * public.cost_per_doc()
         + (select orders from returned_docs) * public.cost_per_order() amt
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
    'cost_per_doc',         public.cost_per_doc(),
    'cost_per_order',       public.cost_per_order(),
    'rts_loss_amount',      (select amt from loss),
    'cancelled_amount',     (select amt from cancelled),
    'cancelled_count',      (select cnt from cancelled),
    'net_amount', (select amt from booked) - (select amt from returned),
    'net_after_rts_cost', (select amt from booked)
                  - (select amt from returned)
                  - (select amt from loss),
    'shipped_count',        (select cnt from shipped),
    'shipped_returned_count', (select cnt from shipped_returned),
    'rts_rate', case when (select cnt from shipped) = 0 then 0
                     else round(
                       (select cnt from shipped_returned)::numeric
                       * 100 / (select cnt from shipped), 1)
                end
  );
$function$;

-- --- Per service ------------------------------------------------------------
-- The order-level cost has to be shared out between the services inside the
-- order, or a two-service order would charge its postage twice over again,
-- once under each name. Each document carries its own share: the per-order
-- cost divided by how many documents are in that order.
create or replace function public.sales_by_service(p_from date, p_to date)
returns json
language sql
stable
as $function$
  with verify as (select public.id_verification_fee() fee),
  item_amounts as (
    select s.id, s.name,
           o.status, o.payment_status,
           o.created_at, o.delivered_at,
           public.order_lost_at(o.status, o.returned_at, o.blocked_at,
                                o.rejected_at) as lost_at,
           oi.quantity,
           -- This item's share of the cost: its own documents, plus the slice
           -- of the one-per-order cost those documents account for.
           oi.quantity * public.cost_per_doc()
             + case when sub.order_docs > 0
                    then public.cost_per_order() * oi.quantity / sub.order_docs
                    else 0 end as item_cost,
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
               ), 0) subtotal,
               coalesce(sum(x.quantity), 0) order_docs
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
        'rts_loss_amount', round(coalesce(sum(item_cost) filter (
            where status = any (public.lost_statuses())
              and lost_at::date between p_from and p_to), 0), 2)
      ) as row
      from item_amounts
      group by id, name
    ) t;
$function$;

-- --- The loss list ----------------------------------------------------------
create or replace function public.returned_orders(p_from date, p_to date)
returns json
language sql
stable
as $function$
  select coalesce(json_agg(json_build_object(
           'order_id', o.id,
           'tracking_code', o.tracking_code,
           'customer_name', cu.full_name,
           'city', cu.city,
           'courier_name', c.name,
           'total_amount', o.total_amount,
           'docs', coalesce(d.docs, 0),
           -- One parcel's postage and one ad, however many certificates.
           'loss_amount', coalesce(d.docs, 0) * public.cost_per_doc()
                          + public.cost_per_order(),
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

-- --- Per batch --------------------------------------------------------------
create or replace function public.sales_by_batch()
returns json
language sql
stable
as $function$
  with per_order as (
    select t.id tag_id, t.name tag_name, t.created_at tag_created,
           o.id order_id, o.status, o.payment_status,
           o.total_amount, o.shipped_at,
           coalesce((select sum(q.quantity) from order_items q
                      where q.order_id = o.id), 0) docs
      from tags t
      join customer_tags ct on ct.tag_id = t.id
      join orders o on o.customer_id = ct.customer_id
     -- An order merged into another carries no documents and no money; it
     -- would put a second copy of the same job into its batch's figures.
     where o.merged_into is null
  ),
  rolled as (
    select tag_created,
           tag_name,
           count(*) filter (where status <> 'cancelled') orders,
           -- Everything the batch is charged for. Cancelled is out: the order
           -- was pulled before it shipped and earns no revenue line either.
           coalesce(sum(docs) filter (where status <> 'cancelled'), 0) docs,
           coalesce(sum(docs) filter (where status = 'cancelled'), 0) cancelled_docs,
           -- Documents on orders that earned nothing: the parcel came back,
           -- or the customer went unreachable or said no at the door.
           coalesce(sum(docs) filter (
             where status = any (public.lost_statuses())), 0) lost_docs,
           count(*) filter (where status = any (public.lost_statuses())) lost_orders,
           coalesce(sum(docs) filter (where status = 'delivered'), 0) delivered_docs,
           -- The same orders again, split by how the sale actually died.
           count(*) filter (where status = 'returned') returned_count,
           count(*) filter (where status = 'blocked')  blocked_count,
           count(*) filter (where status = 'rejected') rejected_count,
           coalesce(sum(total_amount) filter (
             where status = 'delivered' and payment_status = 'paid'), 0) collected,
           coalesce(sum(total_amount) filter (
             where status = any (public.lost_statuses())), 0) lost_amount,
           count(*) filter (where status = any (public.lost_statuses())) lost_count,
           count(*) filter (where shipped_at is not null) shipped
      from per_order
     group by tag_id, tag_name, tag_created
  ),
  costed as (
    select *,
           -- Documents and orders that are still earning or already earned.
           docs - lost_docs           live_docs,
           orders - lost_orders       live_orders,
           (docs - lost_docs) * public.cost_per_doc()
             + (orders - lost_orders) * public.cost_per_order() doc_cost,
           lost_docs * public.cost_per_doc()
             + lost_orders * public.cost_per_order()            lost_cost
      from rolled
  )
  select coalesce(json_agg(row order by tag_created desc), '[]'::json)
    from (
      select tag_created, json_build_object(
        'batch_name',       tag_name,
        'orders',           orders,
        'docs',             docs,
        'cancelled_docs',   cancelled_docs,
        'lost_docs',        lost_docs,
        'delivered_docs',   delivered_docs,
        'live_docs',        live_docs,
        'inflight_docs',    live_docs - delivered_docs,
        'collected_amount', collected,
        -- The two halves of the cost, so the row reads as a subtraction.
        'doc_cost_amount',  doc_cost,
        'rts_cost_amount',  lost_cost,
        'cost_amount',      doc_cost + lost_cost,
        'profit_amount',    collected - doc_cost - lost_cost,
        'lost_amount',      lost_amount,
        'lost_count',       lost_count,
        'returned_count',   returned_count,
        'blocked_count',    blocked_count,
        'rejected_count',   rejected_count,
        'shipped_count',    shipped,
        -- Courier failures only, over what was actually dispatched.
        'rts_rate', case when shipped = 0 then 0
                         else round(returned_count::numeric * 100 / shipped, 1)
                    end,
        -- Customers who stopped answering, over every order in the batch:
        -- most of them are blocked before a parcel ever exists.
        'blocked_rate', case when orders = 0 then 0
                             else round(blocked_count::numeric * 100 / orders, 1)
                        end
      ) as row
      from costed
      -- The newest two dozen. A batch a year old is history, and a dashboard
      -- table that grows without limit stops being readable long before that.
      order by tag_created desc
      limit 24
    ) z;
$function$;
