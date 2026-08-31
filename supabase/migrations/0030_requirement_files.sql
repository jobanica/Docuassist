-- =============================================================================
-- 0030_requirement_files.sql — the papers that come with an ID application (§5)
--
-- A TIN or PhilHealth application is not just a form: the applicant has to send
-- a valid ID, sometimes a birth certificate. Those arrive as photos in
-- Messenger, and until now the only place to keep them was the chat thread —
-- so the supplier had to be sent them again by hand for every order.
--
-- Optional, always: an order is complete without them. This records what was
-- attached, never that something is missing.
--
-- The files themselves live in a PRIVATE storage bucket. Nothing is served from
-- a public URL: every view goes through a short-lived signed link minted after
-- the caller's access to the order has been checked, because these are a
-- customer's identity documents and a guessable public URL would be a leak
-- that never expires.
-- =============================================================================

create table if not exists order_item_files (
  id            uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  -- Path inside the private bucket. The row is the index; deleting it is what
  -- the app treats as deleting the file.
  storage_path  text not null unique,
  file_name     text not null,
  mime_type     text,
  size_bytes    bigint,
  uploaded_by   uuid references staff_users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists order_item_files_item_idx
  on order_item_files (order_item_id, created_at);

alter table order_item_files enable row level security;

-- Same scope as the order the file belongs to: an account limited to certain
-- documents cannot reach the identity papers attached to the others.
create policy order_item_files_staff_select on order_item_files
  for select using (
    is_staff() and exists (
      select 1 from order_items oi
       where oi.id = order_item_id and staff_can_see_order(oi.order_id)
    )
  );
create policy order_item_files_staff_insert on order_item_files
  for insert with check (
    is_staff() and exists (
      select 1 from order_items oi
       where oi.id = order_item_id and staff_can_see_order(oi.order_id)
    )
  );
create policy order_item_files_staff_delete on order_item_files
  for delete using (
    is_staff() and exists (
      select 1 from order_items oi
       where oi.id = order_item_id and staff_can_see_order(oi.order_id)
    )
  );

-- --- The supplier's copy ------------------------------------------------------
-- They are the reason this exists: the requirements have to travel with the
-- job. Same shape as everything else they get — through the function, never
-- from the table, so no price can ride along.
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
        'customer_name',   cu.full_name,
        'phone',           cu.phone,
        'messenger_name',  cu.messenger_name,
        'address_line',    cu.address_line,
        'barangay',        cu.barangay,
        'city',            cu.city,
        'province',        cu.province,
        'zip',             cu.zip,
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
                              'id',         f.id,
                              'file_name',  f.file_name,
                              'mime_type',  f.mime_type,
                              'size_bytes', f.size_bytes
                            ) order by f.created_at), '[]'::json)
                       from order_item_files f
                      where f.order_item_id = oi.id
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

-- Answers "may this caller open this file?" for a supplier, whose access is
-- never expressed as a table read. The app asks before minting a signed link.
create or replace function supplier_can_see_file(p_file uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select is_supplier() and exists (
    select 1
      from order_item_files f
      join order_items oi on oi.id = f.order_item_id
     where f.id = p_file and supplier_can_see_order(oi.order_id)
  );
$$;

grant execute on function supplier_can_see_file(uuid) to authenticated;
