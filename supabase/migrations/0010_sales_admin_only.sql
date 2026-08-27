-- =============================================================================
-- 0010_sales_admin_only.sql — restrict sales/revenue reporting to admins.
--
-- The owner wants revenue visible only to admins; staff keep full CRM access
-- (orders, customers, shipping, SMS) but must not see money.
--
-- The UI gate alone is not enough: these functions were granted to
-- `authenticated`, so any signed-in staff account could call them directly
-- through the REST API and read real revenue. The guard therefore lives in the
-- function itself — each one raises insufficient_privilege for a non-admin,
-- whatever the caller uses. The bodies are otherwise unchanged from 0008.
-- =============================================================================

create or replace function public.sales_summary(p_from date, p_to date)
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
      cancelled as (
        select coalesce(sum(total_amount), 0) amt, count(*) cnt
          from orders
         where status = 'cancelled'
           and cancelled_at::date between p_from and p_to
      ),
      -- RTS rate: share of orders shipped in the range that came back.
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
        'cancelled_amount',     (select amt from cancelled),
        'cancelled_count',      (select cnt from cancelled),
        -- Net = Booked − Returns − Cancellations (§11)
        'net_amount', (select amt from booked)
                      - (select amt from returned)
                      - (select amt from cancelled),
        'shipped_count',        (select cnt from shipped),
        'shipped_returned_count', (select cnt from shipped_returned),
        'rts_rate', case when (select cnt from shipped) = 0 then 0
                         else round(
                           (select cnt from shipped_returned)::numeric
                           * 100 / (select cnt from shipped), 1)
                    end
      )
  );
end;
$$;

create or replace function public.sales_rts_trend(p_months int default 6)
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
      ),
      stats as (
        select m.m as month,
               count(o.id) filter (where o.shipped_at is not null) as shipped,
               count(o.id) filter (where o.status = 'returned')     as returned
          from months m
          left join orders o
            on o.shipped_at is not null
           and date_trunc('month', o.shipped_at)::date = m.m
         group by m.m
      )
      select coalesce(json_agg(json_build_object(
               'month', to_char(month, 'YYYY-MM'),
               'shipped', shipped,
               'returned', returned,
               'rts_rate', case when shipped = 0 then 0
                                else round(returned::numeric * 100 / shipped, 1) end
             ) order by month), '[]'::json)
        from stats
  );
end;
$$;

create or replace function public.sales_by_service(p_from date, p_to date)
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
    with item_amounts as (
        select s.id, s.name,
               o.status, o.payment_status,
               o.created_at, o.delivered_at, o.returned_at,
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
                  and returned_at::date between p_from and p_to)
          ) as row
          from item_amounts
          group by id, name
        ) t
  );
end;
$$;

create or replace function public.sales_by_courier(p_from date, p_to date)
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
    select coalesce(json_agg(json_build_object(
               'courier_name', name,
               'shipped_count', shipped,
               'returned_count', returned,
               'rts_amount', rts_amount,
               'rts_rate', case when shipped = 0 then 0
                                else round(returned::numeric * 100 / shipped, 1) end
             ) order by shipped desc), '[]'::json)
        from (
          select c.name,
                 count(o.id) as shipped,
                 count(o.id) filter (where o.status = 'returned') as returned,
                 coalesce(sum(o.total_amount) filter (where o.status = 'returned'), 0) as rts_amount
            from couriers c
            join orders o on o.courier_id = c.id
           where o.shipped_at is not null
             and o.shipped_at::date between p_from and p_to
           group by c.id, c.name
        ) t
  );
end;
$$;

create or replace function public.returned_orders(p_from date, p_to date)
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
    select coalesce(json_agg(json_build_object(
               'order_id', o.id,
               'tracking_code', o.tracking_code,
               'customer_name', cu.full_name,
               'city', cu.city,
               'courier_name', c.name,
               'total_amount', o.total_amount,
               'delivery_attempts', o.delivery_attempts,
               'return_reason', o.return_reason,
               'returned_at', o.returned_at
             ) order by o.returned_at desc), '[]'::json)
        from orders o
        join customers cu on cu.id = o.customer_id
        left join couriers c on c.id = o.courier_id
       where o.status = 'returned'
         and o.returned_at::date between p_from and p_to
  );
end;
$$;

-- Re-assert grants (create or replace resets them).

revoke all on function public.sales_summary(date, date) from public, anon;
grant execute on function public.sales_summary(date, date) to authenticated;
revoke all on function public.sales_rts_trend(int) from public, anon;
grant execute on function public.sales_rts_trend(int) to authenticated;
revoke all on function public.sales_by_service(date, date) from public, anon;
grant execute on function public.sales_by_service(date, date) to authenticated;
revoke all on function public.sales_by_courier(date, date) from public, anon;
grant execute on function public.sales_by_courier(date, date) to authenticated;
revoke all on function public.returned_orders(date, date) from public, anon;
grant execute on function public.returned_orders(date, date) to authenticated;
