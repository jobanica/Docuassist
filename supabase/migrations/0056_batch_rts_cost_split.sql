-- =============================================================================
-- 0056_batch_rts_cost_split.sql — show what RTS took out of each batch
--
-- The batch table already netted the returns off: every document costs its
-- ₱443 whether or not the parcel is accepted, so the returned ones were
-- inside the single "cost" figure, and their sale price never entered
-- "collected". The arithmetic was right and the damage was invisible.
--
-- Splitting that one cost in two makes the row read as a subtraction anyone
-- can follow, and keeps the bottom line exactly where it was:
--
--   collected − doc cost − RTS cost = net profit
--
--   doc cost   documents that are delivered or still in transit × cost
--   RTS cost   documents on orders that came back, were blocked, or were
--              refused × cost — cash spent on parcels that earned nothing
--
-- Note what is NOT subtracted here: the sale price those lost orders would
-- have fetched. It is reported beside the row as unpaid revenue, because it
-- never arrived and so was never in "collected" — taking it off again would
-- charge the business twice for one return.
-- =============================================================================

create or replace function public.sales_by_batch()
returns json
language sql
stable
as $function$
  with cost as (select public.rts_cost_per_doc() per_doc),
  per_order as (
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
           count(*) orders,
           coalesce(sum(docs), 0) docs,
           -- Documents on orders that earned nothing: the parcel came back,
           -- or the customer went unreachable or said no at the door.
           coalesce(sum(docs) filter (
             where status = any (public.lost_statuses())), 0) lost_docs,
           coalesce(sum(total_amount) filter (
             where status = 'delivered' and payment_status = 'paid'), 0) collected,
           coalesce(sum(total_amount) filter (
             where status = any (public.lost_statuses())), 0) lost_amount,
           count(*) filter (where status = any (public.lost_statuses())) lost_count,
           count(*) filter (where shipped_at is not null) shipped,
           count(*) filter (where status = 'returned') returned
      from per_order
     group by tag_id, tag_name, tag_created
  )
  select coalesce(json_agg(row order by tag_created desc), '[]'::json)
    from (
      select tag_created, json_build_object(
        'batch_name',       tag_name,
        'orders',           orders,
        'docs',             docs,
        'lost_docs',        lost_docs,
        'collected_amount', collected,
        -- The two halves of the cost, so the row reads as a subtraction.
        'doc_cost_amount',  (docs - lost_docs) * (select per_doc from cost),
        'rts_cost_amount',  lost_docs * (select per_doc from cost),
        'cost_amount',      docs * (select per_doc from cost),
        -- Unchanged: the whole cost was always being taken off, the split
        -- above only says how much of it the returns accounted for.
        'profit_amount',    collected - docs * (select per_doc from cost),
        'lost_amount',      lost_amount,
        'lost_count',       lost_count,
        'shipped_count',    shipped,
        'returned_count',   returned,
        'rts_rate', case when shipped = 0 then 0
                         else round(returned::numeric * 100 / shipped, 1)
                    end
      ) as row
      from rolled
      -- The newest two dozen. A batch a year old is history, and a dashboard
      -- table that grows without limit stops being readable long before that.
      order by tag_created desc
      limit 24
    ) z;
$function$;
