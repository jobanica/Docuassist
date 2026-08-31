-- =============================================================================
-- 0033_booked_excludes_cancelled.sql — a cancelled order was never a sale (§11)
--
-- Booked counted every order encoded, cancelled ones included, and Net sales
-- took them off again at the bottom. So the headline figure was always higher
-- than anything that could be collected, and the two tiles disagreed by the
-- value of the cancellations.
--
-- Booked now means orders that are still live. Net sales therefore stops
-- subtracting cancellations — they are already gone — and subtracts only the
-- returns, which were real sales that came back.
--
-- cancelled_amount and cancelled_count stay in the payload: knowing what was
-- called off is worth having, it just is not revenue.
-- =============================================================================

create or replace function public.sales_summary(p_from date, p_to date)
returns json
language sql
stable
as $$
  with booked as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
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
    'collected_amount',     (select amt from collected),
    'collected_count',      (select cnt from collected),
    'rts_amount',           (select amt from returned),
    'rts_count',            (select cnt from returned),
    'rts_docs',             (select docs from returned_docs),
    'rts_cost_per_doc',     public.rts_cost_per_doc(),
    'rts_loss_amount',      (select docs from returned_docs) * public.rts_cost_per_doc(),
    'cancelled_amount',     (select amt from cancelled),
    'cancelled_count',      (select cnt from cancelled),
    -- Net = Booked − Returns. Cancellations are already out of Booked.
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

-- The monthly bars are the same figure over time, so they follow the same rule
-- — otherwise the chart and the tile above it would disagree.
create or replace function public.sales_monthly(p_months integer default 6)
returns json
language plpgsql
stable
as $$
begin
  if not is_admin() then
    raise exception 'Sales reporting is restricted to admin users.'
      using errcode = 'insufficient_privilege';
  end if;

  return (
    with months as (
      select date_trunc('month', (current_date - (n || ' months')::interval))::date m
        from generate_series(p_months - 1, 0, -1) n
    )
    select coalesce(json_agg(json_build_object(
             'month', to_char(m.m, 'YYYY-MM'),
             'label', to_char(m.m, 'Mon'),
             'booked', coalesce((
               select sum(o.total_amount) from orders o
                where date_trunc('month', o.created_at)::date = m.m
                  and o.status <> 'cancelled'), 0),
             'collected', coalesce((
               select sum(o.total_amount) from orders o
                where o.status = 'delivered' and o.payment_status = 'paid'
                  and date_trunc('month', o.delivered_at)::date = m.m), 0)
           ) order by m.m), '[]'::json)
      from months m
  );
end;
$$;

-- And the per-service table, so "which document earns the most" is not skewed
-- by orders nobody paid for.
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
