-- =============================================================================
-- 0018_staff_service_scope.sql — limit a staff member to certain documents.
--
-- The VA who handles TIN and PhilHealth IDs has no business reading PSA birth
-- certificate applications: those carry parents' names, birthplaces and home
-- addresses. Hiding rows in the UI would not be a limit — anyone can read the
-- network tab — so the restriction lives in RLS and the app inherits it.
--
-- No rows in staff_services = no restriction. That keeps every existing account
-- working exactly as before, and makes "all documents" the deliberate default
-- rather than something you can fall into by forgetting to configure it.
-- =============================================================================

create table if not exists staff_services (
  staff_id   uuid not null references staff_users(id) on delete cascade,
  service_id uuid not null references services(id)    on delete cascade,
  primary key (staff_id, service_id)
);
create index if not exists staff_services_staff_idx on staff_services (staff_id);
create index if not exists order_items_service_idx  on order_items (service_id);

-- --- Helpers ----------------------------------------------------------------
-- SECURITY DEFINER so they read staff_services and order_items without
-- re-entering the policies that call them.

create or replace function staff_is_scoped() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_services where staff_id = auth.uid());
$$;

create or replace function staff_can_see_order(p_order uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or not staff_is_scoped()
      or exists (
           select 1
             from order_items oi
             join staff_services ss
               on ss.service_id = oi.service_id
              and ss.staff_id = auth.uid()
            where oi.order_id = p_order
         )
      -- An order exists for a moment before its items are inserted, and the
      -- INSERT ... RETURNING that creates it needs to read it back. An order
      -- with no items yet is therefore visible; it stops being so as soon as
      -- the first item lands.
      or not exists (select 1 from order_items where order_id = p_order);
$$;

create or replace function staff_can_use_service(p_service uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or not staff_is_scoped()
      or exists (
           select 1 from staff_services
            where staff_id = auth.uid() and service_id = p_service
         );
$$;

create or replace function staff_can_see_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_admin()
      or not staff_is_scoped()
      or exists (
           select 1 from orders o
            where o.customer_id = p_customer and staff_can_see_order(o.id)
         )
      -- Same reason as above: a customer is created one statement before their
      -- first order, and that insert reads the new row back.
      or not exists (select 1 from orders where customer_id = p_customer);
$$;

grant execute on function staff_is_scoped() to authenticated;
grant execute on function staff_can_see_order(uuid) to authenticated;
grant execute on function staff_can_use_service(uuid) to authenticated;
grant execute on function staff_can_see_customer(uuid) to authenticated;

-- --- staff_services: staff read their own, admins manage all -----------------
alter table staff_services enable row level security;
drop policy if exists staff_services_read on staff_services;
drop policy if exists staff_services_admin_write on staff_services;
create policy staff_services_read on staff_services
  for select using (staff_id = auth.uid() or is_admin());
create policy staff_services_admin_write on staff_services
  for all using (is_admin()) with check (is_admin());

-- --- Replace the blanket "any staff, everything" policies --------------------
-- Split by command: reads are scoped, writes stay open to any staff so intake
-- works, with order_items checked on insert so a scoped account cannot encode
-- a document it isn't allowed to see.

drop policy if exists orders_staff_all on orders;
create policy orders_staff_select on orders
  for select using (is_staff() and staff_can_see_order(id));
create policy orders_staff_insert on orders
  for insert with check (is_staff());
create policy orders_staff_update on orders
  for update using (is_staff() and staff_can_see_order(id))
  with check (is_staff());
create policy orders_staff_delete on orders
  for delete using (is_staff() and staff_can_see_order(id));

drop policy if exists order_items_staff_all on order_items;
create policy order_items_staff_select on order_items
  for select using (is_staff() and staff_can_see_order(order_id));
create policy order_items_staff_insert on order_items
  for insert with check (is_staff() and staff_can_use_service(service_id));
create policy order_items_staff_update on order_items
  for update using (is_staff() and staff_can_see_order(order_id))
  with check (is_staff() and staff_can_use_service(service_id));
create policy order_items_staff_delete on order_items
  for delete using (is_staff() and staff_can_see_order(order_id));

drop policy if exists osh_staff_all on order_status_history;
create policy osh_staff_select on order_status_history
  for select using (is_staff() and staff_can_see_order(order_id));
create policy osh_staff_insert on order_status_history
  for insert with check (is_staff());
create policy osh_staff_update on order_status_history
  for update using (is_staff() and staff_can_see_order(order_id))
  with check (is_staff());
create policy osh_staff_delete on order_status_history
  for delete using (is_staff() and staff_can_see_order(order_id));

drop policy if exists customers_staff_all on customers;
create policy customers_staff_select on customers
  for select using (is_staff() and staff_can_see_customer(id));
create policy customers_staff_insert on customers
  for insert with check (is_staff());
create policy customers_staff_update on customers
  for update using (is_staff() and staff_can_see_customer(id))
  with check (is_staff());
create policy customers_staff_delete on customers
  for delete using (is_staff() and staff_can_see_customer(id));

-- notifications_log carries the customer's number and the message body, so it
-- follows the same scope as the order it belongs to.
drop policy if exists notifications_log_staff_all on notifications_log;
create policy notifications_log_staff_select on notifications_log
  for select using (
    is_staff() and (order_id is null or staff_can_see_order(order_id))
  );
create policy notifications_log_staff_write on notifications_log
  for insert with check (is_staff());
