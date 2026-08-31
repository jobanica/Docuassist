-- =============================================================================
-- 0028_rts_cost.sql — What a return actually costs (§11)
--
-- A returned parcel hurts twice, and the dashboard only showed one of them.
-- It showed the sale price the customer never paid — but the money already
-- spent getting the document to their door is gone whether or not they take
-- delivery, and that is the figure the owner budgets against.
--
--   Processing   205    paid to the PSA and the encoder, spent before shipping
--   Shipping     105    the courier bills for the trip out and the trip back
--   Commission    33    the agent's cut, already earned on the booking
--   Ad cost      100    what it cost to win this order in the first place
--   ------------------
--   Total        443    per document, not per order
--
-- Per DOCUMENT: an order for three certificates burns three lots of the above,
-- so the cost follows order_items.quantity rather than the order count.
--
-- The four parts live in app_settings because they are business inputs that
-- move — the courier raises its rate, an ad campaign gets cheaper — and none
-- of that should need a deploy.
-- =============================================================================

insert into app_settings (key, value) values
  ('rts_cost_processing', '205'),
  ('rts_cost_shipping',   '105'),
  ('rts_cost_commission',  '33'),
  ('rts_cost_ad',         '100')
on conflict (key) do nothing;

-- --- The per-document cost, read from settings --------------------------------
-- Anything unset or unparseable counts as zero rather than failing the whole
-- dashboard: a blank box in Settings must not blank out the sales figures.
create or replace function public.rts_cost_per_doc()
returns numeric
language sql
stable
as $$
  select coalesce(sum(
           case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                then value::numeric else 0 end
         ), 0)
    from app_settings
   where key in ('rts_cost_processing', 'rts_cost_shipping',
                 'rts_cost_commission', 'rts_cost_ad');
$$;

-- --- Headline totals ----------------------------------------------------------
-- rts_amount stays the revenue that never arrived, because Net sales is a
-- revenue figure and must keep subtracting the full sale price. rts_loss_amount
-- is the new one: cash actually spent on parcels that came back.
create or replace function public.sales_summary(p_from date, p_to date)
returns json
language sql
stable
as $$
  with booked as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where created_at::date between p_from and p_to
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
  -- Documents, not orders: one return of three certificates costs three times.
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
    'collected_amount',     (select amt from collected),
    'collected_count',      (select cnt from collected),
    'rts_amount',           (select amt from returned),
    'rts_count',            (select cnt from returned),
    'rts_docs',             (select docs from returned_docs),
    'rts_cost_per_doc',     public.rts_cost_per_doc(),
    'rts_loss_amount',      (select docs from returned_docs) * public.rts_cost_per_doc(),
    'cancelled_amount',     (select amt from cancelled),
    'cancelled_count',      (select cnt from cancelled),
    -- Net = Booked − Returns − Cancellations (§11). Revenue only.
    'net_amount', (select amt from booked)
                  - (select amt from returned)
                  - (select amt from cancelled),
    -- What is left once the money already sunk into the returns is taken out.
    'net_after_rts_cost', (select amt from booked)
                  - (select amt from returned)
                  - (select amt from cancelled)
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

-- --- Per-service breakdown ----------------------------------------------------
-- Which document line is bleeding: the quantity is on the item, so the cost of
-- a return lands on the service that was actually in the parcel.
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
           (oi.price_at_order * oi.quantity) as amount
      from order_items oi
      join services s on s.id = oi.service_id
      join orders   o on o.id = oi.order_id
  )
  select coalesce(json_agg(row order by (row->>'booked_amount')::numeric desc), '[]'::json)
    from (
      select json_build_object(
        'service_name', name,
        'booked_amount', coalesce(sum(amount) filter (
            where created_at::date between p_from and p_to), 0),
        'booked_count', count(*) filter (
            where created_at::date between p_from and p_to),
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

-- --- Per-courier breakdown ----------------------------------------------------
-- The courier that returns most parcels is the one costing the most money, so
-- the loss belongs beside its RTS rate.
create or replace function public.sales_by_courier(p_from date, p_to date)
returns json
language sql
stable
as $$
  with cost as (select public.rts_cost_per_doc() per_doc)
  select coalesce(json_agg(json_build_object(
           'courier_name', name,
           'shipped_count', shipped,
           'returned_count', returned,
           'rts_amount', rts_amount,
           'rts_docs', rts_docs,
           'rts_loss_amount', rts_docs * (select per_doc from cost),
           'rts_rate', case when shipped = 0 then 0
                            else round(returned::numeric * 100 / shipped, 1) end
         ) order by shipped desc), '[]'::json)
    from (
      select c.name,
             count(o.id) as shipped,
             count(o.id) filter (where o.status = 'returned') as returned,
             coalesce(sum(o.total_amount) filter (where o.status = 'returned'), 0) as rts_amount,
             coalesce((
               select sum(oi.quantity)
                 from order_items oi
                 join orders o2 on o2.id = oi.order_id
                where o2.courier_id = c.id
                  and o2.status = 'returned'
                  and o2.shipped_at is not null
                  and o2.shipped_at::date between p_from and p_to
             ), 0) as rts_docs
        from couriers c
        join orders o on o.courier_id = c.id
       where o.shipped_at is not null
         and o.shipped_at::date between p_from and p_to
       group by c.id, c.name
    ) t;
$$;

-- --- The returned orders themselves -------------------------------------------
-- The per-order "Lost" column showed the sale price, which is not what left the
-- account. Each row now carries its own document count and the cash behind it.
create or replace function public.returned_orders(p_from date, p_to date)
returns json
language sql
stable
as $$
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
           'returned_at', o.returned_at
         ) order by o.returned_at desc), '[]'::json)
    from orders o
    join customers cu on cu.id = o.customer_id
    left join couriers c on c.id = o.courier_id
    left join lateral (
      select sum(oi.quantity) docs from order_items oi where oi.order_id = o.id
    ) d on true
   where o.status = 'returned'
     and o.returned_at::date between p_from and p_to;
$$;

revoke all on function public.rts_cost_per_doc() from public;
grant execute on function public.rts_cost_per_doc() to authenticated;
