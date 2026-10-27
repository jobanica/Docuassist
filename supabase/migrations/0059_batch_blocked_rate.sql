-- =============================================================================
-- 0059_batch_blocked_rate.sql — how often a batch's customers walk away
--
-- The RTS rate answers "is the courier failing?" and nothing else. It could
-- not answer "how many customers did we lose?", and that is now the larger
-- half of the problem: of 30 losses, 15 are customers who blocked us.
--
-- The denominator cannot be the shipped count the RTS rate uses. 14 of those
-- 15 orders were never shipped at all — the customer stops replying while the
-- document is still being processed, long before a parcel exists. Dividing by
-- shipped would quote a blocked rate built on the single blocked order that
-- happened to make it to dispatch and hide the other fourteen.
--
-- So: blocked over orders in the batch. Two rates, two denominators, each the
-- only one its event can honestly take —
--
--   RTS rate      returned ÷ shipped    a delivery that failed
--   Blocked rate  blocked  ÷ orders     a customer who stopped answering
--
-- Cancelled orders are out of both, as they are out of the cost and revenue.
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
           count(*) filter (where status <> 'cancelled') orders,
           -- Everything the batch is charged for. Cancelled is out: the order
           -- was pulled before it shipped and earns no revenue line either.
           coalesce(sum(docs) filter (where status <> 'cancelled'), 0) docs,
           coalesce(sum(docs) filter (where status = 'cancelled'), 0) cancelled_docs,
           -- Documents on orders that earned nothing: the parcel came back,
           -- or the customer went unreachable or said no at the door.
           coalesce(sum(docs) filter (
             where status = any (public.lost_statuses())), 0) lost_docs,
           coalesce(sum(docs) filter (where status = 'delivered'), 0) delivered_docs,
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
        'cancelled_docs',   cancelled_docs,
        'lost_docs',        lost_docs,
        'delivered_docs',   delivered_docs,
        -- Charged documents that are not a write-off: delivered, or still on
        -- their way. Named so the column can show its own count.
        'live_docs',        docs - lost_docs,
        'inflight_docs',    docs - lost_docs - delivered_docs,
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
      from rolled
      -- The newest two dozen. A batch a year old is history, and a dashboard
      -- table that grows without limit stops being readable long before that.
      order by tag_created desc
      limit 24
    ) z;
$function$;
