-- =============================================================================
-- 0057_batch_loss_composition.sql — say which kind of loss a batch took
--
-- The batch table already charged every write-off the same way: a document is
-- a document, and its ₱443 is spent whether the parcel came back, the
-- customer blocked us, or they refused it at the door. That was right, and
-- the column calling itself "RTS cost" made it look wrong — batch 102 read
-- "RTS cost −₱1,772" beside "RTS rate 0%", which is true (no courier returned
-- anything; two customers blocked us and two refused) and reads as a bug.
--
-- So the figure keeps its meaning and the page stops calling it RTS. These
-- three counts let the row show what it is actually made of.
--
-- The rate stays returned ÷ shipped. It answers "is the courier failing?",
-- and a customer who blocked us never gave the courier a chance to fail.
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
           -- The same documents again, split by how the sale actually died.
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
        'profit_amount',    collected - docs * (select per_doc from cost),
        'lost_amount',      lost_amount,
        'lost_count',       lost_count,
        'returned_count',   returned_count,
        'blocked_count',    blocked_count,
        'rejected_count',   rejected_count,
        'shipped_count',    shipped,
        -- Courier failures only. Blocked and refused orders are losses, but
        -- not deliveries the courier got wrong.
        'rts_rate', case when shipped = 0 then 0
                         else round(returned_count::numeric * 100 / shipped, 1)
                    end
      ) as row
      from rolled
      -- The newest two dozen. A batch a year old is history, and a dashboard
      -- table that grows without limit stops being readable long before that.
      order by tag_created desc
      limit 24
    ) z;
$function$;
