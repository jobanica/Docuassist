-- =============================================================================
-- 0041_supplier_notes.sql — the supplier writing back to the office (§11)
--
-- The supplier holds the TIN and PhilHealth jobs, and is the first to notice
-- when one cannot be filed — a missing birthdate, a blurry ID photo, a middle
-- name the customer never gave. They could flag a delay, but that speaks to
-- the customer; what they need is to tell the office "this one is short a
-- detail, chase it" and have the staff who handle these documents see it.
--
-- So a supplier note is its own thing: office-only, plural (one job can be
-- short several things over time), and each one open until a staff member
-- marks it handled. It never reaches the customer's tracking page.
--
-- The supplier reads no table directly, so both writing a note and reading
-- them back go through SECURITY DEFINER; the office reads and resolves them
-- through ordinary RLS, gated the same way it sees the order itself.
-- =============================================================================

create table if not exists supplier_notes (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  body         text not null,
  created_by   uuid references staff_users(id),
  created_at   timestamptz not null default now(),
  -- Set when a staff member has acted on it, so the board can stop flagging
  -- the order and the note reads as done rather than vanishing.
  addressed_at timestamptz,
  addressed_by uuid references staff_users(id)
);
create index if not exists supplier_notes_order_idx on supplier_notes (order_id);
create index if not exists supplier_notes_open_idx on supplier_notes (order_id)
  where addressed_at is null;

alter table supplier_notes enable row level security;

-- The office: read and resolve notes on any order it can see. Insertion is the
-- supplier's job (through the function below), so staff get select + update,
-- not insert — a staff member asking the supplier a question is not what this
-- is for.
drop policy if exists supplier_notes_staff_select on supplier_notes;
create policy supplier_notes_staff_select on supplier_notes
  for select using (is_staff() and staff_can_see_order(order_id));
drop policy if exists supplier_notes_staff_update on supplier_notes;
create policy supplier_notes_staff_update on supplier_notes
  for update using (is_staff() and staff_can_see_order(order_id))
  with check (is_staff() and staff_can_see_order(order_id));

-- --- The supplier leaving a note -------------------------------------------
create or replace function public.supplier_add_note(p_order uuid, p_body text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_row  supplier_notes%rowtype;
begin
  if not is_supplier() then
    raise exception 'Only a supplier account can leave a note here.';
  end if;
  if not supplier_can_see_order(p_order) then
    raise exception 'That order is not one of yours.';
  end if;
  if v_body is null then
    raise exception 'Write something before sending the note.';
  end if;
  if length(v_body) > 1000 then
    raise exception 'Keep the note under 1000 characters.';
  end if;

  insert into supplier_notes (order_id, body, created_by)
  values (p_order, v_body, auth.uid())
  returning * into v_row;

  return json_build_object(
    'id', v_row.id, 'body', v_row.body, 'created_at', v_row.created_at,
    'addressed_at', v_row.addressed_at
  );
end;
$$;

grant execute on function public.supplier_add_note(uuid, text)
  to authenticated, service_role;

-- The supplier's own view of a note, so the queue can show what was said and
-- whether the office has picked it up. Same-order guard, definer-run.
create or replace function public.supplier_notes_for(p_order uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when is_supplier() and supplier_can_see_order(p_order) then (
    select coalesce(json_agg(json_build_object(
             'id', n.id, 'body', n.body, 'created_at', n.created_at,
             'addressed_at', n.addressed_at
           ) order by n.created_at), '[]'::json)
      from supplier_notes n where n.order_id = p_order
  ) else '[]'::json end;
$$;

grant execute on function public.supplier_notes_for(uuid)
  to authenticated, service_role;

-- --- The supplier queue carries its notes ----------------------------------
create or replace function public.supplier_queue()
returns json
language sql
stable security definer
set search_path = public
as $$
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
        'notes', (
          select coalesce(json_agg(json_build_object(
                   'id', n.id, 'body', n.body, 'created_at', n.created_at,
                   'addressed_at', n.addressed_at
                 ) order by n.created_at), '[]'::json)
            from supplier_notes n where n.order_id = o.id
        ),
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
