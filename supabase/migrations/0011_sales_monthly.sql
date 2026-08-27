-- =============================================================================
-- 0011_sales_monthly.sql — monthly booked vs collected, for the dashboard chart.
-- Same admin-only guard as the other sales functions (0010).
-- =============================================================================
create or replace function public.sales_monthly(p_months int default 6)
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
                where date_trunc('month', o.created_at)::date = m.m), 0),
             'collected', coalesce((
               select sum(o.total_amount) from orders o
                where o.status = 'delivered' and o.payment_status = 'paid'
                  and date_trunc('month', o.delivered_at)::date = m.m), 0)
           ) order by m.m), '[]'::json)
      from months m
  );
end;
$$;

revoke all on function public.sales_monthly(int) from public, anon;
grant execute on function public.sales_monthly(int) to authenticated;
