-- =============================================================================
-- 0042_supplier_shipped_to_office.sql — the supplier posting the ID to the office
--
-- The supplier makes the TIN/PhilHealth ID, then ships the physical card to
-- the office (Jobani), who receives it and ships it on to the customer. That
-- middle leg had nowhere to live: the supplier's board went straight from "in
-- progress" to leaving her hands, and the office had no signal the card was on
-- its way.
--
-- This is NOT a pipeline status — to the customer the order is still being
-- processed until the office releases it — so it is a flag on the order, not a
-- new stage. supplier_shipped_at set while the order is still 'processing'
-- means "made and posted to the office"; the office sees it and, when the card
-- arrives, clicks Released as it always has. Moving off 'processing' clears the
-- flag, so the card drops off the supplier's board the moment it is released.
-- =============================================================================

alter table orders
  add column if not exists supplier_shipped_at timestamptz;

comment on column orders.supplier_shipped_at is
  'Set by the supplier when the finished ID is posted to the office. Cleared '
  'when the order leaves Processing. Never shown to the customer.';

-- Fold the clear into the existing status-change guard, beside the delay clear.
create or replace function public.orders_clear_delay() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and old.status = 'processing' then
    new.delayed_at := null;
    new.delay_reason := null;
    -- The card has left Processing, so "posted to the office" no longer applies.
    new.supplier_shipped_at := null;
  end if;
  return new;
end;
$$;

-- --- The supplier's action --------------------------------------------------
-- p_shipped true marks it posted, false takes the mark back (a mis-click, or
-- the card came back). Only a job the supplier is processing can be marked.
create or replace function public.supplier_ship_to_office(
  p_order uuid, p_shipped boolean default true
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_at     timestamptz;
begin
  if not is_supplier() then
    raise exception 'Only a supplier account can mark a job posted to the office.';
  end if;
  if not supplier_can_see_order(p_order) then
    raise exception 'That order is not one of yours.';
  end if;

  select status, supplier_shipped_at into v_status, v_at
    from orders where id = p_order for update;
  if v_status is null then
    raise exception 'That order no longer exists.';
  end if;
  if v_status <> 'processing' then
    raise exception 'Only a job you are processing can be posted. This one is at %.', v_status;
  end if;

  v_at := case when p_shipped then coalesce(v_at, now()) else null end;
  update orders set supplier_shipped_at = v_at where id = p_order;

  insert into order_status_history (order_id, status, event_type, note, changed_by)
  values (p_order, 'processing', 'note',
          case when p_shipped then 'Supplier posted the ID to the office'
               else 'Supplier un-marked "posted to the office"' end,
          auth.uid());

  return v_at;
end;
$$;

grant execute on function public.supplier_ship_to_office(uuid, boolean)
  to authenticated, service_role;

-- --- The supplier queue carries the flag ------------------------------------
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
        'supplier_shipped_at', o.supplier_shipped_at,
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
