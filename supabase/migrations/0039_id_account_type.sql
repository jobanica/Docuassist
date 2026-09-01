-- =============================================================================
-- 0039_id_account_type.sql — new account or existing one (§5, §8)
--
-- Every TIN and PhilHealth request starts with the same question, and the
-- answer changes the whole job:
--
--   New application      the supplier registers them from scratch
--   Existing, number known    no registration — the number is what is needed
--   Existing, number unknown  someone has to look it up at the agency first
--
-- The supplier could not see which of the three they were holding, so an
-- existing account got filed as a new one and bounced. It is now asked on the
-- form and shown on their card before anything else.
--
-- The third answer costs money to answer: the lookup is a separate errand at
-- the BIR or PhilHealth office. That is charged as its own fee rather than
-- folded into the price of the ID, so the ID still earns what an ID earns and
-- the verification work shows up as itself.
-- =============================================================================

insert into app_settings (key, value) values ('id_verification_fee', '100')
on conflict (key) do nothing;

create or replace function public.id_verification_fee()
returns numeric
language sql
stable
as $$
  select coalesce((
    select case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                then value::numeric else 0 end
      from app_settings where key = 'id_verification_fee'
  ), 0);
$$;

grant execute on function public.id_verification_fee() to authenticated, service_role;

-- --- The question, on both ID templates --------------------------------------
-- Inserted at the front of the field list: it is the first thing asked on the
-- phone, and it decides whether the number below it is even wanted. Written as
-- an upsert on the existing array so a template edited since is not clobbered.
update services
   set form_fields = (
     jsonb_build_array(jsonb_build_object(
       'key', 'account_type',
       'label', 'New or existing account?',
       'type', 'select',
       'required', true,
       'options', jsonb_build_array(
         jsonb_build_object('value', 'new',
                            'label', 'New — first time applying'),
         jsonb_build_object('value', 'existing_known',
                            'label', 'Existing — number known'),
         jsonb_build_object('value', 'existing_unknown',
                            'label', 'Existing — number unknown (verification fee)')
       )
     )) || (
       select coalesce(jsonb_agg(f order by ord), '[]'::jsonb)
         from jsonb_array_elements(form_fields) with ordinality t(f, ord)
        where f->>'key' <> 'account_type'
     )
   )::jsonb
 where code in ('tin_id', 'philhealth_id');

-- --- What the customer pays ---------------------------------------------------
-- One fee per document that needs the lookup, not per copy: it is one errand
-- whether they asked for one card or two.
create or replace function public.order_verification_fees(p_order_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(count(*), 0) * public.id_verification_fee()
    from order_items oi
   where oi.order_id = p_order_id
     and oi.form_details->>'account_type' = 'existing_unknown';
$$;

-- Both places that compute a total have to agree, so both read the same two
-- helpers: the items plus any verification, less the discount.
create or replace function recalc_order_total(p_order_id uuid) returns void
language plpgsql as $$
begin
  update orders o
     set total_amount = greatest(
       coalesce((
         select sum(oi.price_at_order * oi.quantity)
           from order_items oi
          where oi.order_id = p_order_id
       ), 0)
       + public.order_verification_fees(p_order_id)
       - o.discount_amount, 0)
   where o.id = p_order_id;
end;
$$;

create or replace function orders_touch_total() returns trigger
language plpgsql as $$
begin
  new.total_amount := greatest(
    coalesce((
      select sum(oi.price_at_order * oi.quantity)
        from order_items oi
       where oi.order_id = new.id
    ), 0)
    + public.order_verification_fees(new.id)
    - new.discount_amount, 0);
  return new;
end;
$$;

-- Nothing has been answered yet, so every fee is zero and this only proves it.
select recalc_order_total(id) from orders;

-- --- Reporting ----------------------------------------------------------------
-- The per-service table adds up item prices, so the fee would go missing there
-- and the table would under-earn against Booked. It belongs to the document
-- that needed it — the ₱100 was earned looking up that person's TIN — so it is
-- added to that line, and the discount is spread over the larger figure.
create or replace function public.sales_by_service(p_from date, p_to date)
returns json
language sql
stable
as $$
  with cost as (select public.rts_cost_per_doc() per_doc),
  verify as (select public.id_verification_fee() fee),
  item_amounts as (
    select s.id, s.name,
           o.status, o.payment_status,
           o.created_at, o.delivered_at, o.returned_at,
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
