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
