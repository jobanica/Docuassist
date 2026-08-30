-- =============================================================================
-- 0026_order_created_by.sql — who encoded this order.
--
-- With several people on the board, "who took this one?" was unanswerable
-- without opening the order and reading its history. It is the first question
-- asked when a customer follows up, or when an order looks wrong.
--
-- SET NULL, like every other reference to staff: the order outlives the
-- account, and a deleted staff member must not take orders with them. A null
-- reads as the customer's own submission through the order link, which is
-- exactly what `source = 'public'` already means.
-- =============================================================================

alter table orders
  add column if not exists created_by uuid
    references staff_users(id) on delete set null;

-- Backfill from the first thing that happened to each order. Every staff-made
-- order writes a status_change as it is created, so this recovers the encoder
-- for the whole history; customer-submitted orders have no staff behind them
-- and correctly stay null.
update orders o
   set created_by = first_event.changed_by
  from (
    select distinct on (order_id) order_id, changed_by
      from order_status_history
     where changed_by is not null
     order by order_id, created_at
  ) first_event
 where o.id = first_event.order_id
   and o.created_by is null;

create index if not exists orders_created_by_idx on orders (created_by);
