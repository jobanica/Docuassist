-- =============================================================================
-- 0003_rls.sql — Row Level Security (§13)
--   * Staff-only access to EVERYTHING.
--   * Admin role gates settings (services, couriers, notifications, app_settings).
--   * NO anon policies anywhere → the public page cannot read tables directly;
--     it only calls get_tracking_info() (0004) which is SECURITY DEFINER.
-- =============================================================================

-- --- Role helpers -------------------------------------------------------------
create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_users where id = auth.uid());
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff_users where id = auth.uid() and role = 'admin');
$$;

grant execute on function is_staff() to authenticated;
grant execute on function is_admin() to authenticated;

-- --- Enable RLS on every table ------------------------------------------------
alter table order_statuses        enable row level security;
alter table staff_users           enable row level security;
alter table customers             enable row level security;
alter table services              enable row level security;
alter table couriers              enable row level security;
alter table orders                enable row level security;
alter table order_items           enable row level security;
alter table order_status_history  enable row level security;
alter table notification_settings enable row level security;
alter table notifications_log     enable row level security;
alter table parse_logs            enable row level security;
alter table app_settings          enable row level security;
alter table rate_limit_hits       enable row level security;

-- --- staff_users: read own row; admins manage all ----------------------------
create policy staff_read_self on staff_users
  for select using (id = auth.uid() or is_admin());
create policy staff_admin_write on staff_users
  for all using (is_admin()) with check (is_admin());

-- --- Order-operation tables: any staff, full CRUD ----------------------------
create policy customers_staff_all on customers
  for all using (is_staff()) with check (is_staff());
create policy orders_staff_all on orders
  for all using (is_staff()) with check (is_staff());
create policy order_items_staff_all on order_items
  for all using (is_staff()) with check (is_staff());
create policy osh_staff_all on order_status_history
  for all using (is_staff()) with check (is_staff());
create policy notifications_log_staff_all on notifications_log
  for all using (is_staff()) with check (is_staff());
create policy parse_logs_staff_all on parse_logs
  for all using (is_staff()) with check (is_staff());

-- --- Reference/settings tables: staff read, admin write ----------------------
create policy order_statuses_staff_read on order_statuses
  for select using (is_staff());
create policy order_statuses_admin_write on order_statuses
  for all using (is_admin()) with check (is_admin());

create policy services_staff_read on services
  for select using (is_staff());
create policy services_admin_write on services
  for all using (is_admin()) with check (is_admin());

create policy couriers_staff_read on couriers
  for select using (is_staff());
create policy couriers_admin_write on couriers
  for all using (is_admin()) with check (is_admin());

create policy notif_settings_staff_read on notification_settings
  for select using (is_staff());
create policy notif_settings_admin_write on notification_settings
  for all using (is_admin()) with check (is_admin());

create policy app_settings_staff_read on app_settings
  for select using (is_staff());
create policy app_settings_admin_write on app_settings
  for all using (is_admin()) with check (is_admin());

-- rate_limit_hits: no policies → only SECURITY DEFINER functions touch it.
-- (RLS enabled, zero policies = deny to all direct roles.)
