-- =============================================================================
-- 0006_status_since.sql — track when an order entered its current status, so
-- the orders board can flag aging orders (§8: e.g. processing > 14 days = red).
-- =============================================================================
alter table orders
  add column if not exists status_since timestamptz not null default now();

-- Keep status_since in sync: bump it whenever status actually changes.
create or replace function orders_touch_status_since() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_since := now();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_since on orders;
create trigger orders_status_since
  before update on orders
  for each row execute function orders_touch_status_since();

-- Backfill any existing rows to their creation time (no-op on a fresh DB).
update orders set status_since = created_at where status_since is null;
