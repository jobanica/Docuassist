-- =============================================================================
-- DocuAssist PH — full schema setup for a fresh Supabase project.
--
-- This file is migrations 0001–0008 concatenated in order, for pasting into
-- the Supabase SQL Editor in one go. Run it ONCE on a new project.
-- (If you use the Supabase CLI instead, run `supabase db push` and ignore this.)
--
-- After it succeeds, create your first staff login with:
--   npm run create-staff -- --email you@example.com --password "..." \\
--       --name "Your Name" --role admin
-- =============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0001_init.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 0001_init.sql — DocuAssist PH core schema (CONTEXT.md §5)
-- =============================================================================
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Reference table so statuses (and their public helper copy) are DB-driven,
-- not hardcoded in components. [ext of §5, required by §4 "statuses from DB"]
-- -----------------------------------------------------------------------------
create table if not exists order_statuses (
  code          text primary key,
  label         text not null,
  sort_order    int  not null,
  is_terminal   boolean not null default false,
  -- Customer-facing helper text for the public tracking page (§7). May contain
  -- {token} placeholders (e.g. {courier}, {number}, {total}) interpolated server-side.
  public_helper text
);

-- -----------------------------------------------------------------------------
-- Staff (identity lives in Supabase auth.users; this holds name + role). §5
-- Declared early so order_status_history.changed_by can reference it.
-- -----------------------------------------------------------------------------
create table if not exists staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Customers §5
-- -----------------------------------------------------------------------------
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null,
  phone          text,                 -- PH mobile, for SMS
  messenger_name text,
  messenger_link text,
  address_line   text,
  barangay       text,
  city           text,
  province       text,
  zip            text,
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists customers_full_name_idx on customers (lower(full_name));
create index if not exists customers_phone_idx on customers (phone);

-- -----------------------------------------------------------------------------
-- Services §5 — admin-configurable; form_fields drives the dynamic encode form.
-- -----------------------------------------------------------------------------
create table if not exists services (
  id                     uuid primary key default gen_random_uuid(),
  code                   text unique not null,
  name                   text not null,
  price                  numeric(10,2) not null default 0,
  processing_days_min    int not null default 7,
  processing_days_max    int not null default 14,
  shipping_days_estimate int not null default 7,
  -- [{ key, label, type: 'text'|'date'|'number'|'textarea', required, synonyms[] }]
  form_fields            jsonb not null default '[]'::jsonb,
  active                 boolean not null default true,
  created_at             timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Couriers §5 — admin-configurable; general tracking page URL (no deep links).
-- -----------------------------------------------------------------------------
create table if not exists couriers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  tracking_page_url text,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Orders §5 — one status per order (v1). tracking_code set by trigger (§6).
-- -----------------------------------------------------------------------------
create table if not exists orders (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers(id),
  tracking_code           text unique not null,
  status                  text not null references order_statuses(code) default 'new_inquiry',
  total_amount            numeric(10,2) not null default 0,
  payment_method          text not null default 'cod',
  payment_status          text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  courier_id              uuid references couriers(id),
  courier_tracking_number text,
  shipped_at              timestamptz,
  delivered_at            timestamptz,
  delivery_attempts       int not null default 0,
  returned_at             timestamptz,
  return_reason           text,
  cancelled_at            timestamptz,           -- [ext] parallel to returned_at for §11 ledger
  cancel_reason           text,                  -- [ext] §4 cancel "with reason"
  expected_release_date   date,
  expected_delivery_date  date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_customer_idx on orders (customer_id);
create index if not exists orders_created_idx on orders (created_at);
create index if not exists orders_courier_idx on orders (courier_id);

-- -----------------------------------------------------------------------------
-- Order items §5 — per-document form_details captured at encode time.
-- -----------------------------------------------------------------------------
create table if not exists order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  service_id     uuid not null references services(id),
  quantity       int not null default 1 check (quantity > 0),
  price_at_order numeric(10,2) not null default 0,
  form_details   jsonb not null default '{}'::jsonb
);
create index if not exists order_items_order_idx on order_items (order_id);

-- -----------------------------------------------------------------------------
-- Status history §5 — also records non-status events (failed attempts, backward
-- corrections). event_type/attempt_number are [ext] to satisfy §4.
-- -----------------------------------------------------------------------------
create table if not exists order_status_history (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  status         text references order_statuses(code),  -- nullable for pure events
  event_type     text not null default 'status_change'
                   check (event_type in ('status_change','failed_attempt','backward_correction')),
  attempt_number int,                                    -- set for failed_attempt (1..3)
  note           text,
  changed_by     uuid references staff_users(id),
  created_at     timestamptz not null default now()
);
create index if not exists osh_order_created_idx on order_status_history (order_id, created_at);

-- -----------------------------------------------------------------------------
-- SMS templates + toggles, DB-driven (§10)
-- -----------------------------------------------------------------------------
create table if not exists notification_settings (
  event_key text primary key,   -- details_received | shipped | failed_attempt | delivered
  enabled   boolean not null default true,
  template  text not null
);

create table if not exists notifications_log (            -- §10
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references orders(id) on delete set null,
  type       text,
  phone      text,
  status     text,                                        -- sent | stubbed | failed
  response   text,
  created_at timestamptz not null default now()
);

create table if not exists parse_logs (                   -- §9 cost visibility
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete set null,
  service_code text,
  tier         int,                                       -- 1 or 2
  tokens_in    int,
  tokens_out   int,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Generic key/value app settings (messenger_url, business_name, logo_url, ...)
-- -----------------------------------------------------------------------------
create table if not exists app_settings (
  key   text primary key,
  value text
);

-- -----------------------------------------------------------------------------
-- Rate-limit bookkeeping for the public tracking lookup (§6). Fixed window.
-- -----------------------------------------------------------------------------
create table if not exists rate_limit_hits (
  bucket_key   text not null,          -- e.g. 'track:<ip>'
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (bucket_key, window_start)
);

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0002_functions_triggers.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0003_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0004_rpc_tracking.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 0004_rpc_tracking.sql — public tracking lookup (§7, §13)
--   The ONLY anon-reachable data path. SECURITY DEFINER so it bypasses RLS,
--   but it hand-selects a strict whitelist. It NEVER returns address, barangay,
--   city, province, zip, phone, birthdate, parents' names, notes, form_details,
--   customer/order ids, or courier_tracking_number when no courier is set.
-- =============================================================================

create or replace function public.get_tracking_info(p_code text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  o             orders%rowtype;
  first_name    text;
  service_names text[];
  courier_json  json;
  history_json  json;
  st            order_statuses%rowtype;
begin
  select * into o from orders where tracking_code = p_code;
  if not found then
    return null;               -- caller renders the friendly not-found screen
  end if;

  select * into st from order_statuses where code = o.status;

  -- First name only (never the full name). §13
  select split_part(trim(c.full_name), ' ', 1) into first_name
    from customers c where c.id = o.customer_id;

  -- Service display names only (never form_details / document contents). §13
  select array_agg(s.name order by s.name) into service_names
    from order_items oi
    join services s on s.id = oi.service_id
   where oi.order_id = o.id;

  -- Courier block only when courier info exists (§7: hidden otherwise).
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

  -- History: status + date + event type/attempt/note. Notes here are staff
  -- transition notes and failed-attempt reasons — customer-safe per §7 (which
  -- explicitly shows failure reasons). PII lives on other tables, never here.
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
    'history', coalesce(history_json, '[]'::json)
  );
end;
$$;

-- Anon may execute ONLY this function. No table grants to anon anywhere.
revoke all on function public.get_tracking_info(text) from public;
grant execute on function public.get_tracking_info(text) to anon, authenticated, service_role;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0005_seed.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 0005_seed.sql — seed statuses, services, couriers, SMS templates, settings
-- Idempotent (on conflict do nothing / update).
-- =============================================================================

-- --- Order statuses (6 pipeline + 2 terminal) with public helper copy (§7) ----
insert into order_statuses (code, label, sort_order, is_terminal, public_helper) values
  ('new_inquiry',      'New Inquiry',      1, false,
     'We received your inquiry! Please send us your complete details so we can start.'),
  ('details_received', 'Details Received', 2, false,
     'Salamat! We got your details. Your order is queued to be processed.'),
  ('processing',       'Processing',       3, false,
     'Your documents are being processed. This usually takes 1–2 weeks.'),
  ('released',         'Released',         4, false,
     'Your document has been released and is being prepared for shipping.'),
  ('shipped',          'Shipped',          5, false,
     'Your documents are on the way via {courier}! Tracking #: {number}. Please prepare ₱{total} for cash on delivery.'),
  ('delivered',        'Delivered',        6, true,
     'Delivered na! Salamat sa pagtitiwala sa DocuAssist PH. 💙'),
  ('cancelled',        'Cancelled',        7, true,
     'This order was cancelled. Message our page if you have questions.'),
  ('returned',         'Returned to Sender', 8, true,
     'Your parcel was returned to us after 3 delivery attempts. Please message our page to arrange redelivery.')
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      public_helper = excluded.public_helper;

-- --- Services (§1) with per-type form_fields --------------------------------
-- Certificate group: birth / cenomar / marriage / death
-- ID group: tin_id / philhealth_id
insert into services (code, name, price, processing_days_min, processing_days_max, shipping_days_estimate, form_fields, active) values
  ('psa_birth', 'PSA Birth Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name on Record","type":"text","required":true,"synonyms":["full name","pangalan","name","name on certificate"]},
      {"key":"date_of_event","label":"Date of Birth","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan","birthday"]},
      {"key":"place_of_event","label":"Place of Birth","type":"text","required":true,"synonyms":["place of birth","lugar ng kapanganakan","pob"]},
      {"key":"fathers_name","label":"Father''s Name","type":"text","required":false,"synonyms":["father","fathers name","tatay","ama","pangalan ng ama"]},
      {"key":"mothers_maiden_name","label":"Mother''s Maiden Name","type":"text","required":false,"synonyms":["mother","mothers maiden name","nanay","ina","pangalan ng ina","maiden name"]},
      {"key":"requester_relationship","label":"Requester''s Relationship","type":"text","required":false,"synonyms":["relationship","relasyon","kaugnayan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin","gagamitin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya","number of copies"]}
    ]'::jsonb, true),
  ('cenomar', 'CENOMAR (No Marriage Record)', 465, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name on Record","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"date_of_event","label":"Date of Birth","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"place_of_event","label":"Place of Birth","type":"text","required":true,"synonyms":["place of birth","lugar ng kapanganakan"]},
      {"key":"fathers_name","label":"Father''s Name","type":"text","required":false,"synonyms":["father","tatay","ama"]},
      {"key":"mothers_maiden_name","label":"Mother''s Maiden Name","type":"text","required":false,"synonyms":["mother","nanay","ina","maiden name"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('psa_marriage', 'PSA Marriage Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Husband''s Full Name","type":"text","required":true,"synonyms":["husband","asawang lalaki","groom","full name"]},
      {"key":"spouse_name","label":"Wife''s Full Name","type":"text","required":true,"synonyms":["wife","asawang babae","bride","spouse"]},
      {"key":"date_of_event","label":"Date of Marriage","type":"date","required":true,"synonyms":["date of marriage","kasal","wedding date"]},
      {"key":"place_of_event","label":"Place of Marriage","type":"text","required":true,"synonyms":["place of marriage","lugar ng kasal"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('psa_death', 'PSA Death Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name of Deceased","type":"text","required":true,"synonyms":["deceased","namatay","full name"]},
      {"key":"date_of_event","label":"Date of Death","type":"date","required":true,"synonyms":["date of death","namatay","death date"]},
      {"key":"place_of_event","label":"Place of Death","type":"text","required":true,"synonyms":["place of death","lugar ng kamatayan"]},
      {"key":"requester_relationship","label":"Requester''s Relationship","type":"text","required":false,"synonyms":["relationship","relasyon","kaugnayan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('tin_id', 'TIN ID', 500, 7, 14, 7,
    '[
      {"key":"full_name","label":"Full Name","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"birthdate","label":"Birthdate","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"existing_number","label":"Existing TIN (if any)","type":"text","required":false,"synonyms":["tin","tin number","existing tin"]},
      {"key":"address","label":"Address","type":"text","required":false,"synonyms":["address","tirahan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]}
    ]'::jsonb, true),
  ('philhealth_id', 'PhilHealth ID', 500, 7, 14, 7,
    '[
      {"key":"full_name","label":"Full Name","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"birthdate","label":"Birthdate","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"existing_number","label":"Existing PhilHealth No. (if any)","type":"text","required":false,"synonyms":["philhealth","philhealth number","pin"]},
      {"key":"address","label":"Address","type":"text","required":false,"synonyms":["address","tirahan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]}
    ]'::jsonb, true)
on conflict (code) do nothing;

-- --- Couriers (§5) — general tracking pages, no per-number deep links --------
insert into couriers (name, tracking_page_url, active) values
  ('J&T Express', 'https://www.jtexpress.ph/trajectoryQuery', true),
  ('LBC',         'https://www.lbcexpress.com/track/',        true),
  ('Flash Express','https://www.flashexpress.ph/tracking/',   true)
on conflict do nothing;

-- --- SMS templates + toggles (§10) — failed_attempt defaults ON --------------
insert into notification_settings (event_key, enabled, template) values
  ('details_received', true,  'Order confirmed! Track here: {link}'),
  ('shipped',          true,  'Your documents are on the way via {courier}. COD ₱{total}. Track: {link}'),
  ('failed_attempt',   true,  'Hi {name}, delivery attempt {n}/3 for your DocuAssist PH order was unsuccessful. Courier will retry — please keep your phone on and prepare ₱{total} COD. {link}'),
  ('delivered',        false, 'Salamat, {name}! Your DocuAssist PH order was delivered. We appreciate your trust. 💙')
on conflict (event_key) do nothing;

-- --- App settings -----------------------------------------------------------
insert into app_settings (key, value) values
  ('business_name', 'DocuAssist PH'),
  ('messenger_url', 'https://m.me/DocuAssistPH'),
  ('logo_url', '')
on conflict (key) do nothing;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0006_status_since.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
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

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0007_public_business_info.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 0007_public_business_info.sql — expose only the non-sensitive business
-- branding the public tracking page needs (name, Messenger link, logo).
-- app_settings itself stays staff-only under RLS; this whitelisted RPC is the
-- single anon-reachable path to these three keys.
-- =============================================================================
create or replace function public.get_public_business_info()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'business_name', coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
    'messenger_url', (select value from app_settings where key = 'messenger_url'),
    'logo_url', nullif((select value from app_settings where key = 'logo_url'), '')
  );
$$;

revoke all on function public.get_public_business_info() from public;
grant execute on function public.get_public_business_info() to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Public, DB-driven pipeline stage labels for the tracking stepper. Returns the
-- six forward stages (excludes terminal cancelled/returned). No PII.
-- -----------------------------------------------------------------------------
create or replace function public.get_public_pipeline()
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- The six forward stages new_inquiry..delivered (sort_order 1..6);
  -- terminal cancelled (7) and returned (8) are excluded.
  select coalesce(json_agg(json_build_object('code', code, 'label', label) order by sort_order), '[]'::json)
    from order_statuses
   where sort_order between 1 and 6;
$$;

revoke all on function public.get_public_pipeline() from public;
grant execute on function public.get_public_pipeline() to anon, authenticated, service_role;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 0008_sales_rpcs.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- =============================================================================
-- 0008_sales_rpcs.sql — Sales & revenue reporting (§11)
--
-- Ledger integrity: every figure is COMPUTED from order statuses/amounts at
-- query time. Nothing is stored as a running total, so these numbers can never
-- drift out of sync with the orders themselves.
--
-- Range basis (as agreed in implementation_plan.md):
--   Booked        -> orders.created_at
--   Collected     -> orders.delivered_at (and payment_status = 'paid')
--   RTS losses    -> orders.returned_at
--   Cancellations -> orders.cancelled_at
--
-- All functions are staff-only: SECURITY INVOKER, so RLS applies and anon
-- (which has no policy on orders) can read nothing.
-- =============================================================================

-- --- Headline totals for a date range -----------------------------------------
create or replace function public.sales_summary(p_from date, p_to date)
returns json
language sql
stable
as $$
  with booked as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where created_at::date between p_from and p_to
  ),
  collected as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'delivered'
       and payment_status = 'paid'
       and delivered_at::date between p_from and p_to
  ),
  returned as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'returned'
       and returned_at::date between p_from and p_to
  ),
  cancelled as (
    select coalesce(sum(total_amount), 0) amt, count(*) cnt
      from orders
     where status = 'cancelled'
       and cancelled_at::date between p_from and p_to
  ),
  -- RTS rate: share of orders shipped in the range that came back.
  shipped as (
    select count(*) cnt
      from orders
     where shipped_at is not null
       and shipped_at::date between p_from and p_to
  ),
  shipped_returned as (
    select count(*) cnt
      from orders
     where status = 'returned'
       and shipped_at is not null
       and shipped_at::date between p_from and p_to
  )
  select json_build_object(
    'booked_amount',        (select amt from booked),
    'booked_count',         (select cnt from booked),
    'collected_amount',     (select amt from collected),
    'collected_count',      (select cnt from collected),
    'rts_amount',           (select amt from returned),
    'rts_count',            (select cnt from returned),
    'cancelled_amount',     (select amt from cancelled),
    'cancelled_count',      (select cnt from cancelled),
    -- Net = Booked − Returns − Cancellations (§11)
    'net_amount', (select amt from booked)
                  - (select amt from returned)
                  - (select amt from cancelled),
    'shipped_count',        (select cnt from shipped),
    'shipped_returned_count', (select cnt from shipped_returned),
    'rts_rate', case when (select cnt from shipped) = 0 then 0
                     else round(
                       (select cnt from shipped_returned)::numeric
                       * 100 / (select cnt from shipped), 1)
                end
  );
$$;

-- --- RTS rate trend, monthly ---------------------------------------------------
create or replace function public.sales_rts_trend(p_months int default 6)
returns json
language sql
stable
as $$
  with months as (
    select date_trunc('month', (current_date - (n || ' months')::interval))::date m
      from generate_series(p_months - 1, 0, -1) n
  ),
  stats as (
    select m.m as month,
           count(o.id) filter (where o.shipped_at is not null) as shipped,
           count(o.id) filter (where o.status = 'returned')     as returned
      from months m
      left join orders o
        on o.shipped_at is not null
       and date_trunc('month', o.shipped_at)::date = m.m
     group by m.m
  )
  select coalesce(json_agg(json_build_object(
           'month', to_char(month, 'YYYY-MM'),
           'shipped', shipped,
           'returned', returned,
           'rts_rate', case when shipped = 0 then 0
                            else round(returned::numeric * 100 / shipped, 1) end
         ) order by month), '[]'::json)
    from stats;
$$;

-- --- Per-service breakdown -----------------------------------------------------
-- Which documents earn the most, and which get returned the most (§11).
create or replace function public.sales_by_service(p_from date, p_to date)
returns json
language sql
stable
as $$
  with item_amounts as (
    select s.id, s.name,
           o.status, o.payment_status,
           o.created_at, o.delivered_at, o.returned_at,
           (oi.price_at_order * oi.quantity) as amount
      from order_items oi
      join services s on s.id = oi.service_id
      join orders   o on o.id = oi.order_id
  )
  select coalesce(json_agg(row order by (row->>'booked_amount')::numeric desc), '[]'::json)
    from (
      select json_build_object(
        'service_name', name,
        'booked_amount', coalesce(sum(amount) filter (
            where created_at::date between p_from and p_to), 0),
        'booked_count', count(*) filter (
            where created_at::date between p_from and p_to),
        'collected_amount', coalesce(sum(amount) filter (
            where status = 'delivered' and payment_status = 'paid'
              and delivered_at::date between p_from and p_to), 0),
        'rts_amount', coalesce(sum(amount) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to), 0),
        'rts_count', count(*) filter (
            where status = 'returned'
              and returned_at::date between p_from and p_to)
      ) as row
      from item_amounts
      group by id, name
    ) t;
$$;

-- --- Per-courier breakdown, including each courier's RTS rate ------------------
create or replace function public.sales_by_courier(p_from date, p_to date)
returns json
language sql
stable
as $$
  select coalesce(json_agg(json_build_object(
           'courier_name', name,
           'shipped_count', shipped,
           'returned_count', returned,
           'rts_amount', rts_amount,
           'rts_rate', case when shipped = 0 then 0
                            else round(returned::numeric * 100 / shipped, 1) end
         ) order by shipped desc), '[]'::json)
    from (
      select c.name,
             count(o.id) as shipped,
             count(o.id) filter (where o.status = 'returned') as returned,
             coalesce(sum(o.total_amount) filter (where o.status = 'returned'), 0) as rts_amount
        from couriers c
        join orders o on o.courier_id = c.id
       where o.shipped_at is not null
         and o.shipped_at::date between p_from and p_to
       group by c.id, c.name
    ) t;
$$;

-- --- Returned orders, with reasons, so patterns are visible (§11) --------------
create or replace function public.returned_orders(p_from date, p_to date)
returns json
language sql
stable
as $$
  select coalesce(json_agg(json_build_object(
           'order_id', o.id,
           'tracking_code', o.tracking_code,
           'customer_name', cu.full_name,
           'city', cu.city,
           'courier_name', c.name,
           'total_amount', o.total_amount,
           'delivery_attempts', o.delivery_attempts,
           'return_reason', o.return_reason,
           'returned_at', o.returned_at
         ) order by o.returned_at desc), '[]'::json)
    from orders o
    join customers cu on cu.id = o.customer_id
    left join couriers c on c.id = o.courier_id
   where o.status = 'returned'
     and o.returned_at::date between p_from and p_to;
$$;

-- Staff-only: SECURITY INVOKER (default) means RLS on orders still applies.
revoke all on function public.sales_summary(date, date) from public;
revoke all on function public.sales_rts_trend(int) from public;
revoke all on function public.sales_by_service(date, date) from public;
revoke all on function public.sales_by_courier(date, date) from public;
revoke all on function public.returned_orders(date, date) from public;
grant execute on function public.sales_summary(date, date) to authenticated;
grant execute on function public.sales_rts_trend(int) to authenticated;
grant execute on function public.sales_by_service(date, date) to authenticated;
grant execute on function public.sales_by_courier(date, date) to authenticated;
grant execute on function public.returned_orders(date, date) to authenticated;
