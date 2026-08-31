-- =============================================================================
-- 0031_delays.sql — jobs that are taking too long, and saying so (§7, §11)
--
-- An ID application sits with the supplier for a fortnight and nobody notices
-- until the customer asks. Three things fix that:
--
--   1. Age. status_since already records when an order entered its current
--      stage, so how long it has been with the supplier is a subtraction, not
--      a new column. A week is worth a look; a fortnight needs chasing.
--   2. A reason. The supplier marks a job delayed and says why, with a photo
--      of the queue slip or the office notice if they have one.
--   3. Telling the customer. The reason reaches the tracking page, so the
--      person waiting learns it from the page rather than from asking twice.
--
-- What the supplier types here is shown to the customer verbatim. That is the
-- point — they are the one who knows why — but it is worth knowing that is how
-- it works.
-- =============================================================================

alter table orders add column if not exists delayed_at   timestamptz;
alter table orders add column if not exists delay_reason text;

-- A delay belongs to the stage it happened in. Once the order moves on, the
-- reason is history: leaving it set would keep telling the customer their
-- finished document is held up.
create or replace function orders_clear_delay() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and old.status = 'processing' then
    new.delayed_at := null;
    new.delay_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_clear_delay on orders;
create trigger orders_clear_delay
  before update on orders
  for each row execute function orders_clear_delay();

-- --- The photo that goes with a delay ---------------------------------------
-- Kept apart from order_item_files: that table hangs off one document because
-- a requirement belongs to one application. A delay is the whole order's.
create table if not exists order_delay_files (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references staff_users(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists order_delay_files_order_idx
  on order_delay_files (order_id, created_at);

alter table order_delay_files enable row level security;

create policy order_delay_files_staff_select on order_delay_files
  for select using (is_staff() and staff_can_see_order(order_id));
create policy order_delay_files_staff_insert on order_delay_files
  for insert with check (is_staff() and staff_can_see_order(order_id));
create policy order_delay_files_staff_delete on order_delay_files
  for delete using (is_staff() and staff_can_see_order(order_id));

-- The supplier reads no table, so their access is a question the app asks.
create or replace function supplier_can_see_delay_file(p_file uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_supplier() and exists (
    select 1 from order_delay_files f
     where f.id = p_file and supplier_can_see_order(f.order_id)
  );
$$;
grant execute on function supplier_can_see_delay_file(uuid) to authenticated;

-- --- The supplier says why ---------------------------------------------------
-- Only while the job is actually with them. An empty reason lifts the flag,
-- which is how they say "moving again" without needing a second button.
create or replace function supplier_mark_delayed(p_order uuid, p_reason text)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_status text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not is_supplier() then
    raise exception 'Only a supplier account can flag a delay here.';
  end if;
  if not supplier_can_see_order(p_order) then
    raise exception 'That order is not one of yours.';
  end if;

  select status into v_status from orders where id = p_order for update;
  if v_status is null then
    raise exception 'That order no longer exists.';
  end if;
  if v_status <> 'processing' then
    raise exception 'Only a job you are processing can be flagged. This one is at %.', v_status;
  end if;
  if v_reason is not null and length(v_reason) > 300 then
    raise exception 'Keep the reason under 300 characters — the customer reads it.';
  end if;

  update orders
     set delayed_at   = case when v_reason is null then null else coalesce(delayed_at, now()) end,
         delay_reason = v_reason
   where id = p_order;

  insert into order_status_history (order_id, status, event_type, note, changed_by)
  values (p_order, 'processing', 'note',
          case when v_reason is null then 'Supplier: delay cleared'
               else 'Supplier flagged a delay: ' || v_reason end,
          auth.uid());

  return coalesce(v_reason, '');
end;
$$;

revoke all on function supplier_mark_delayed(uuid, text) from public;
grant execute on function supplier_mark_delayed(uuid, text) to authenticated;

-- --- The supplier's queue, now carrying the clock and the flag ---------------
create or replace function supplier_queue()
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(row order by (row->>'created_at')), '[]'::json)
    from (
      select json_build_object(
        'order_id',        o.id,
        'tracking_code',   o.tracking_code,
        'status',          o.status,
        'created_at',      o.created_at,
        'status_since',    o.status_since,
        'delayed_at',      o.delayed_at,
        'delay_reason',    o.delay_reason,
        'customer_name',   cu.full_name,
        'phone',           cu.phone,
        'messenger_name',  cu.messenger_name,
        'address_line',    cu.address_line,
        'barangay',        cu.barangay,
        'city',            cu.city,
        'province',        cu.province,
        'zip',             cu.zip,
        'delay_files', (
          select coalesce(json_agg(json_build_object(
                   'id', f.id, 'file_name', f.file_name,
                   'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                   'created_at', f.created_at
                 ) order by f.created_at), '[]'::json)
            from order_delay_files f where f.order_id = o.id
        ),
        'items', (
          select coalesce(json_agg(json_build_object(
                   'item_id',      oi.id,
                   'service_name', s.name,
                   'service_code', s.code,
                   'quantity',     oi.quantity,
                   'form_fields',  s.form_fields,
                   'form_details', oi.form_details,
                   'pasted_details', oi.pasted_details,
                   'files', (
                     select coalesce(json_agg(json_build_object(
                              'id', f.id, 'file_name', f.file_name,
                              'mime_type', f.mime_type, 'size_bytes', f.size_bytes,
                              'created_at', f.created_at
                            ) order by f.created_at), '[]'::json)
                       from order_item_files f where f.order_item_id = oi.id
                   )
                 ) order by s.sort_order), '[]'::json)
            from order_items oi
            join services s on s.id = oi.service_id
            join staff_services ss
              on ss.service_id = oi.service_id and ss.staff_id = auth.uid()
           where oi.order_id = o.id
        )
      ) as row
      from orders o
      join customers cu on cu.id = o.customer_id
     where is_supplier()
       and supplier_can_see_order(o.id)
       and o.status in ('details_received', 'processing')
    ) t;
$$;

revoke all on function supplier_queue() from public;
grant execute on function supplier_queue() to authenticated;

-- --- What the customer is told ----------------------------------------------
-- Two fields added to the whitelist, and nothing else: whether the job is held
-- up and the reason for it. Not who flagged it, not the photo, not the clock —
-- an order simply being slow is not something to announce.
create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  courier_json  json;
  history_json  json;
  messenger_json json;
  st            order_statuses%rowtype;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;
  end if;

  select * into st from order_statuses where code = o.status;

  select split_part(trim(c.full_name), ' ', 1) into first_name
    from customers c where c.id = o.customer_id;

  select array_agg(s.name order by s.name) into service_names
    from order_items oi
    join services s on s.id = oi.service_id
   where oi.order_id = o.id;

  if o.courier_id is not null then
    select json_build_object(
      'name', cr.name,
      'tracking_page_url', cr.tracking_page_url,
      'tracking_number', o.courier_tracking_number
    ) into courier_json
    from couriers cr where cr.id = o.courier_id;
  else
    courier_json := null;
  end if;

  messenger_json := resolve_messenger_page(o.messenger_page_id);

  select json_agg(json_build_object(
           'status', h.status,
           'label', hs.label,
           'event_type', h.event_type,
           'attempt_number', h.attempt_number,
           'note', h.note,
           'date', h.created_at
         ) order by h.created_at)
    into history_json
    from order_status_history h
    left join order_statuses hs on hs.code = h.status
   where h.order_id = o.id;

  return json_build_object(
    'tracking_code', o.tracking_code,
    'first_name', first_name,
    'service_names', coalesce(service_names, array[]::text[]),
    'status', o.status,
    'status_label', st.label,
    'status_sort_order', st.sort_order,
    'is_terminal', st.is_terminal,
    'public_helper', st.public_helper,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'payment_status', o.payment_status,
    'courier', courier_json,
    'delivery_attempts', o.delivery_attempts,
    'expected_release_date', o.expected_release_date,
    'expected_delivery_date', o.expected_delivery_date,
    'shipped_at', o.shipped_at,
    'delivered_at', o.delivered_at,
    'returned_at', o.returned_at,
    'return_reason', o.return_reason,
    'is_delayed', o.delayed_at is not null,
    'delayed_at', o.delayed_at,
    'delay_reason', o.delay_reason,
    'messenger', messenger_json,
    'history', coalesce(history_json, '[]'::json)
  );
end;
$$;

grant execute on function public.get_tracking_info(text) to anon, authenticated, service_role;
