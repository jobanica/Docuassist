-- =============================================================================
-- 0061_deleted_orders.sql — somewhere for a deleted order to land
--
-- Staff need to remove an order encoded by mistake: the wrong customer, a
-- duplicate, a test row. Cancelling is the wrong tool — a cancelled order is
-- a real order that did not proceed, and it stays in the counts as one.
--
-- But a delete on a money record with no trace is the same trap as the
-- Blocked button was before it had an undo, and worse: the foreign keys
-- cascade, so the items, the status history, the receipts and the supplier
-- notes all go with it. Pressing it on the wrong row would be unrecoverable.
--
-- So every delete writes the whole order here first — the row, its items and
-- its history, as JSON — with who removed it and why. The order really is
-- gone from the board and from every figure, which is what was asked for; it
-- is simply not gone from the record of having existed. Restoring one is a
-- deliberate act with SQL, not a button, because needing it should be rare.
-- =============================================================================

create table if not exists deleted_orders (
  id uuid primary key default gen_random_uuid(),
  -- Not a foreign key: the order it names no longer exists. That is the point.
  order_id uuid not null,
  tracking_code text not null,
  customer_name text,
  status text,
  total_amount numeric,
  -- The order row, its items and its history, exactly as they were.
  snapshot jsonb not null,
  reason text not null,
  deleted_by uuid references staff_users(id),
  deleted_at timestamptz not null default now()
);

create index if not exists deleted_orders_deleted_at_idx
  on deleted_orders (deleted_at desc);
create index if not exists deleted_orders_tracking_code_idx
  on deleted_orders (tracking_code);

comment on table deleted_orders is
  'Orders removed as encoding mistakes, kept whole so a wrong press can be '
  'undone by hand. Nothing reads this table on the dashboard: a deleted '
  'order counts towards no revenue, no loss and no rate.';

alter table deleted_orders enable row level security;

-- Readable by staff so someone can see what was removed and by whom, and
-- insertable by staff because the delete runs as the person pressing it.
-- There is deliberately no update or delete policy: the record of a deletion
-- is not itself editable, or the audit trail would be worth nothing.
drop policy if exists deleted_orders_staff_select on deleted_orders;
create policy deleted_orders_staff_select on deleted_orders
  for select using (is_staff());

drop policy if exists deleted_orders_staff_insert on deleted_orders;
create policy deleted_orders_staff_insert on deleted_orders
  for insert with check (is_staff());
