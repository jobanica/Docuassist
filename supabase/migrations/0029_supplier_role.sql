-- =============================================================================
-- 0029_supplier_role.sql — an account for the people who process the IDs (§5)
--
-- TIN and PhilHealth are handled by an outside supplier. They need the
-- applicant's details to do the work and a way to say "this one is started",
-- and nothing else — above all not the price the customer is charged, which is
-- the margin being negotiated with them.
--
-- Hiding the price in the UI would not be a limit: the anon key is in the
-- browser bundle and PostgREST is a public endpoint, so anyone who can log in
-- can query orders.total_amount directly. The restriction therefore has to be
-- in the database.
--
-- RLS cannot hide a column, only a row. So a supplier is given no read on any
-- data table at all, and everything they see arrives through two SECURITY
-- DEFINER functions that name the columns they may have. is_staff() is the one
-- place that changes: every policy in the schema is written in terms of it, so
-- excluding suppliers there closes every table at once and no future policy can
-- forget to.
-- =============================================================================

alter table staff_users drop constraint if exists staff_users_role_check;
alter table staff_users add constraint staff_users_role_check
  check (role in ('admin', 'staff', 'supplier'));

-- --- The one gate ------------------------------------------------------------
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users
     where id = auth.uid() and active and role in ('admin', 'staff')
  );
$$;

create or replace function is_supplier() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from staff_users
     where id = auth.uid() and active and role = 'supplier'
  );
$$;

grant execute on function is_supplier() to authenticated;

-- --- Which orders are this supplier's ----------------------------------------
-- The same staff_services scope the staff accounts use, so the admin ticks
-- "TIN ID" and "PhilHealth ID" on the account and nothing else is theirs. A
-- supplier with no documents ticked gets nothing, rather than everything:
-- the open default that is right for staff is the wrong way round here.
create or replace function supplier_can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
           select 1
             from order_items oi
             join staff_services ss
               on ss.service_id = oi.service_id
              and ss.staff_id = auth.uid()
            where oi.order_id = p_order
         );
$$;

grant execute on function supplier_can_see_order(uuid) to authenticated;

-- --- What the supplier sees --------------------------------------------------
-- Every column is named here on purpose. total_amount, price_at_order and
-- services.price are absent, and a column added to orders later cannot appear
-- in this list by accident.
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
                   'pasted_details', oi.pasted_details
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
       -- Waiting to be started, and started but not yet handed back. It leaves
       -- the list when the owner marks it Released, which is what they do when
       -- the finished IDs arrive.
       and o.status in ('details_received', 'processing')
    ) t;
$$;

revoke all on function supplier_queue() from public;
grant execute on function supplier_queue() to authenticated;

-- --- The only thing a supplier may change ------------------------------------
-- Details Received -> Processing, and nothing else. Released onwards is the
-- owner's to record, because it means the finished IDs are physically back.
create or replace function supplier_start_processing(p_order uuid)
returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  v_status text;
begin
  if not is_supplier() then
    raise exception 'Only a supplier account can start processing here.';
  end if;
  if not supplier_can_see_order(p_order) then
    raise exception 'That order is not one of yours.';
  end if;

  select status into v_status from orders where id = p_order for update;
  if v_status is null then
    raise exception 'That order no longer exists.';
  end if;
  if v_status = 'processing' then
    return 'processing';           -- already started; a second press is not an error
  end if;
  if v_status <> 'details_received' then
    raise exception 'Only an order at Details Received can be started. This one is at %.', v_status;
  end if;

  update orders set status = 'processing' where id = p_order;
  insert into order_status_history (order_id, status, event_type, note, changed_by)
  values (p_order, 'processing', 'status_change', 'Started by the supplier', auth.uid());

  return 'processing';
end;
$$;

revoke all on function supplier_start_processing(uuid) from public;
grant execute on function supplier_start_processing(uuid) to authenticated;
