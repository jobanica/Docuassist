-- =============================================================================
-- 0055_sales_by_batch.sql — what each tagged batch actually earned (§11)
--
-- Documents are filed in batches, and the owner reasons about them that way:
-- "did batch 91 make money, and how many came back?" The dashboard could show
-- that for a date range and for a courier, but never for a batch — so the one
-- unit of work the office actually plans around had no P&L against it.
--
-- Profit is the cash position: every document filed has already cost its
-- ₱443 (processing, shipping, commission, ad — see 0028), spent whether or
-- not the parcel is ever accepted, so the cost lands when the document is
-- filed rather than when it is delivered. A batch still in transit therefore
-- reads as a loss and climbs into profit as the deliveries land. That is the
-- honest shape of it: the money went out first.
--
--   profit = collected (delivered & paid) − documents × cost per document
--
-- The RTS rate stays the courier's failure rate — returned ÷ shipped. An
-- order blocked or refused by the customer is money lost but not a delivery
-- that failed, so it sits in the loss column and out of the rate, exactly as
-- it does on the headline figures.
--
-- Batches are tags on CUSTOMERS, not on orders, so a customer carrying two
-- tags has their order counted under both. Seven customers do today. The
-- totals are therefore per batch and do not sum to the business total; the
-- dashboard says so where it draws them.
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
        'collected_amount', collected,
        'cost_amount',      docs * (select per_doc from cost),
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
