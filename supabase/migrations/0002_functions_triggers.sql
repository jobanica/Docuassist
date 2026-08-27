-- =============================================================================
-- 0002_functions_triggers.sql — helpers, triggers, tracking-code generation
-- =============================================================================

-- --- updated_at maintenance ----------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- --- Unguessable tracking code (§6) -------------------------------------------
-- Crockford base32 alphabet (no I, L, O, U to avoid ambiguity). 10 chars from
-- cryptographically-random bytes → ~50 bits of entropy, non-sequential.
create or replace function generate_tracking_code() returns text
language plpgsql as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  code text := '';
  b bytea;
  i int;
begin
  b := gen_random_bytes(10);
  for i in 0..9 loop
    code := code || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- Assign a unique tracking_code on insert if not provided (retry on collision).
create or replace function orders_set_tracking_code() returns trigger
language plpgsql as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.tracking_code is not null and length(new.tracking_code) > 0 then
    return new;
  end if;
  loop
    candidate := generate_tracking_code();
    exit when not exists (select 1 from orders where tracking_code = candidate);
    tries := tries + 1;
    if tries > 10 then
      raise exception 'could not generate a unique tracking_code after % tries', tries;
    end if;
  end loop;
  new.tracking_code := candidate;
  return new;
end;
$$;

drop trigger if exists orders_tracking_code on orders;
create trigger orders_tracking_code
  before insert on orders
  for each row execute function orders_set_tracking_code();

-- --- Recompute orders.total_amount from its items (§11 ledger integrity) -------
create or replace function recalc_order_total(p_order_id uuid) returns void
language plpgsql as $$
begin
  update orders o
     set total_amount = coalesce((
       select sum(oi.price_at_order * oi.quantity)
         from order_items oi
        where oi.order_id = p_order_id
     ), 0)
   where o.id = p_order_id;
end;
$$;

-- Keep total_amount in sync whenever items change.
create or replace function order_items_touch_total() returns trigger
language plpgsql as $$
begin
  perform recalc_order_total(coalesce(new.order_id, old.order_id));
  return null;
end;
$$;

drop trigger if exists order_items_total_aiud on order_items;
create trigger order_items_total_aiud
  after insert or update or delete on order_items
  for each row execute function order_items_touch_total();

-- --- Fixed-window rate limit for the public tracking lookup (§6) ---------------
-- Returns true if the call is allowed, false if the limit is exceeded.
create or replace function check_rate_limit(
  p_key text, p_max int, p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  current_count int;
begin
  insert into rate_limit_hits (bucket_key, window_start, count)
       values (p_key, w, 1)
  on conflict (bucket_key, window_start)
    do update set count = rate_limit_hits.count + 1
    returning count into current_count;

  -- opportunistic cleanup of old windows
  delete from rate_limit_hits where window_start < now() - interval '1 hour';

  return current_count <= p_max;
end;
$$;

revoke all on function check_rate_limit(text, int, int) from public;
grant execute on function check_rate_limit(text, int, int) to anon, authenticated, service_role;
