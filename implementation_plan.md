# Implementation Plan — DocuAssist PH

Derived from `CONTEXT.md` (the source of truth). Nothing here adds scope beyond it; §14 out-of-scope items are excluded. Build proceeds **one phase at a time**, with `npm run build` + a test-me summary + a stop for go-signal after each.

---

## 0. Stack & Conventions

- **Next.js 14 (App Router) + TypeScript**, single app (admin + public `/track`).
- **Supabase**: Postgres, Auth (staff only, email/password), RLS. Access via `@supabase/ssr`.
- **Tailwind + shadcn/ui** for admin; hand-rolled mobile-first CSS for the public page.
- **qrcode** (QR PNG), **@anthropic-ai/sdk** (Tier-2 parse), **date-fns** + **date-fns-tz** (Asia/Manila), **zod** (validation).
- Currency **PHP (₱)**; all displayed dates in **Asia/Manila**.
- Statuses, services, couriers, SMS templates, and helper copy all come **from the DB/settings**, never hardcoded in components.
- **Stubbable externals:** if `SEMAPHORE_API_KEY` / `ANTHROPIC_API_KEY` is missing, log to console + `notifications_log` / `parse_logs` instead of throwing.

### Env (`.env.local.example`, commented, no secrets committed)
```
NEXT_PUBLIC_SUPABASE_URL=          # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon/public key (browser)
SUPABASE_SERVICE_ROLE_KEY=         # server-only; used by public tracking RPC caller + admin scripts
NEXT_PUBLIC_SITE_URL=              # e.g. https://docuassist.ph — used to build /track links + QR
SEMAPHORE_API_KEY=                 # optional; if blank, SMS is stubbed (logged, not sent)
SEMAPHORE_SENDER_NAME=             # registered Semaphore sender id
ANTHROPIC_API_KEY=                 # optional; if blank, Tier-2 parse is skipped (Tier-1 only)
ANTHROPIC_PARSE_MODEL=claude-haiku-4-5-20251001  # Haiku-class model for the parse fallback
```

---

## 1. File / Route Map

```
app/
  layout.tsx                      # root layout, fonts, Toaster
  page.tsx                        # redirect → /dashboard (if session) or /login
  login/page.tsx                  # staff login (Supabase email/password)
  auth/sign-out/route.ts          # POST sign-out

  (admin)/                        # guarded group: layout checks session + staff_users row
    layout.tsx                    # sidebar nav + session guard (redirect to /login)
    dashboard/page.tsx            # §8.6 status counts, aging, + §11 sales dashboard
    orders/
      page.tsx                    # orders table: filter/search/status badges/aging highlight
      new/page.tsx                # new order wizard + Paste & Parse (Phase 2 form, Phase 5 parse)
      [id]/page.tsx               # order detail: stepper, advance, cancel, courier, COD, history
    customers/
      page.tsx                    # customers list + search
      [id]/page.tsx               # customer detail + order history
    settings/
      services/page.tsx           # CRUD services + prices/durations + form_fields editor
      couriers/page.tsx           # CRUD couriers (name + tracking_page_url)
      notifications/page.tsx      # per-event SMS toggles + template editor

  track/
    [code]/page.tsx               # PUBLIC, no auth, mobile-first stepper (§7)
    not-found.tsx                 # friendly "Order not found" + Messenger link
  api/
    track/[code]/route.ts         # public lookup: rate-limit → RPC → whitelisted JSON only

lib/
  supabase/{server.ts,client.ts,middleware.ts,admin.ts}   # SSR client, browser client, service-role client
  types.ts                        # generated + hand DB types
  actions/                        # server actions (mutations)
    orders.ts customers.ts services.ts couriers.ts settings.ts parse.ts sms.ts
  parse/{tier1.ts,tier2.ts,labels.ts}     # rule-based parser, AI fallback, label synonyms
  sms/semaphore.ts                # send() with stub fallback + notifications_log write
  tracking-code.ts                # (client-side helper; canonical gen is a DB trigger)
  qr.ts                           # QR PNG data-url
  dates.ts                        # Asia/Manila format + expected-date math
  money.ts                        # ₱ formatting
  status.ts                       # status metadata loader + interpolation helpers
  sales.ts                        # typed wrappers over sales RPCs

components/
  ui/*                            # shadcn primitives
  admin/*                         # OrdersTable, StatusStepper, AdvanceStatusDialog, CourierFields,
                                  #   FailedAttemptDialog, PasteParseBox, DynamicFormFields, TrackingPanel
  track/*                         # PublicStepper, CopyTrackingButton, StatusHelper

supabase/migrations/*.sql         # see §2
scripts/create-staff.ts           # create first staff user via service role (documented manual step)
middleware.ts                     # session refresh for (admin) routes
```

---

## 2. Supabase Schema — SQL Migrations (Phase 1 deliverable)

Extensions to what §5 lists are minimal and additive, flagged **[ext]** with rationale.

### `0001_init.sql`
```sql
create extension if not exists pgcrypto;

-- Reference table so statuses are DB-driven, not hardcoded [ext: §4 "statuses come from DB"]
create table order_statuses (
  code            text primary key,
  label           text not null,
  sort_order      int  not null,
  is_terminal     boolean not null default false,
  public_helper   text            -- {token} template shown on public page (§7)
);

create table customers (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text,                    -- PH mobile for SMS
  messenger_name text,
  messenger_link text,
  address_line  text,
  barangay      text,
  city          text,
  province      text,
  zip           text,
  notes         text,
  created_at    timestamptz not null default now()
);

create table services (
  id                     uuid primary key default gen_random_uuid(),
  code                   text unique not null,
  name                   text not null,
  price                  numeric(10,2) not null default 0,
  processing_days_min    int not null default 7,
  processing_days_max    int not null default 14,
  shipping_days_estimate int not null default 7,
  form_fields            jsonb not null default '[]'::jsonb,  -- [{key,label,type,required,synonyms[]}]
  active                 boolean not null default true,
  created_at             timestamptz not null default now()
);

create table couriers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  tracking_page_url text,             -- courier's general tracker (no per-number deep link)
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create table orders (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers(id),
  tracking_code           text unique not null,   -- set by BEFORE INSERT trigger (§6)
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
  cancelled_at            timestamptz,          -- [ext] parallel to returned_at for ledger
  cancel_reason           text,                 -- [ext] §4 cancel "with reason"
  expected_release_date   date,
  expected_delivery_date  date,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index on orders (status);
create index on orders (customer_id);
create index on orders (created_at);

create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  service_id     uuid not null references services(id),
  quantity       int not null default 1,
  price_at_order numeric(10,2) not null default 0,
  form_details   jsonb not null default '{}'::jsonb
);
create index on order_items (order_id);

create table order_status_history (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  status       text references order_statuses(code),   -- nullable for non-status events
  event_type   text not null default 'status_change'   -- [ext] 'status_change'|'failed_attempt'|'backward_correction'
                 check (event_type in ('status_change','failed_attempt','backward_correction')),
  attempt_number int,                                   -- [ext] set for failed_attempt (1..3)
  note         text,
  changed_by   uuid references staff_users(id),
  created_at   timestamptz not null default now()
);
create index on order_status_history (order_id, created_at);

create table staff_users (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create table notification_settings (             -- SMS templates + toggles, DB-driven (§10)
  event_key text primary key,                     -- details_received|shipped|failed_attempt|delivered
  enabled   boolean not null default true,
  template  text not null
);

create table notifications_log (                  -- §10
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid references orders(id) on delete set null,
  type       text,
  phone      text,
  status     text,            -- sent|stubbed|failed
  response   text,
  created_at timestamptz not null default now()
);

create table parse_logs (                         -- §9 cost visibility
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references orders(id) on delete set null,
  service_code text,
  tier         int,             -- 1 or 2
  tokens_in    int,
  tokens_out   int,
  created_at   timestamptz not null default now()
);

create table app_settings (                       -- messenger_url, business_name, logo, etc.
  key   text primary key,
  value text
);

-- updated_at + tracking_code + total_amount triggers
-- generate_tracking_code(): 10-char Crockford base32 from gen_random_bytes, retry on collision.
```

### `0002_functions_triggers.sql`
- `set_updated_at()` → BEFORE UPDATE on `orders`.
- `generate_tracking_code()` + `orders_set_tracking_code()` BEFORE INSERT (unguessable, non-sequential, §6).
- `recalc_order_total(order_id)` → sums `order_items.price_at_order * quantity` into `orders.total_amount`; called from order server actions after items change.

### `0003_rls.sql`
- `alter table ... enable row level security;` on **every** table.
- Helper: `is_staff()` = `exists(select 1 from staff_users where id = auth.uid())`; `is_admin()` = role check.
- Policies: **staff-only** full CRUD on customers, orders, order_items, order_status_history, couriers, services, notification_settings, notifications_log, parse_logs, order_statuses (read), app_settings.
- **Settings-write** (services, couriers, notification_settings, app_settings, order_statuses) → `is_admin()`; order operations → `is_staff()`.
- `staff_users`: a user may read own row; admins manage all.
- **NO anon policies anywhere** → the public page cannot touch tables directly. It only calls the RPC below.

### `0004_rpc_tracking.sql`
```sql
-- SECURITY DEFINER, returns ONLY §13-whitelisted fields, granted to anon.
create function public.get_tracking_info(p_code text) returns json ...
-- Returns: first_name (split from full_name), service_names[], status, status_label,
--          public_helper (interpolated server-side), total_amount, payment_status,
--          courier {name, tracking_page_url, tracking_number}, delivery_attempts,
--          expected_release_date, expected_delivery_date, returned/return_reason,
--          history [{status, label, date, event_type, attempt_number, reason_if_public}]
-- NEVER returns: address, birthdate, parents' names, form_details, phone, notes, ids.
-- Optional lightweight rate-limit table hit is done in the API route, not here.
grant execute on function public.get_tracking_info(text) to anon;
```
Rate limiting lives in `app/api/track/[code]/route.ts` (fixed-window per IP via a small `rate_limit_hits` table + `check_rate_limit()` RPC, or in-memory as a fallback). The **only** public data path is: route → `get_tracking_info` → whitelisted JSON.

### `0005_seed.sql`
- 8 `order_statuses` (6 pipeline + `cancelled` + `returned`) with `public_helper` copy from §7.
- 6 services (§1 table) with sensible `form_fields` schemas (cert group vs ID group per §5), prices/durations as editable defaults.
- 3 couriers: J&T Express, LBC, Flash Express, each with its public tracking-page URL.
- 4 `notification_settings` rows with §10 templates; `failed_attempt` **enabled = true** by default (highest-priority).
- `app_settings`: `business_name`, `messenger_url`, `logo_url` placeholders.

> First staff login can't be seeded with a password in SQL. `scripts/create-staff.ts` (service role) creates the auth user + `staff_users` row; documented in README. Alternatively create via Supabase dashboard then insert the `staff_users` row.

---

## 3. Build Order (matches kickoff; working app after each phase)

**Phase 1 — Schema + auth.** All migrations above; seed services/couriers/statuses/settings; RLS staff-only, no public table access; Supabase clients; login page + `(admin)` guard + sign-out; `create-staff` script. *Test: log in, land on an empty dashboard; confirm anon cannot read tables.*

**Phase 2 — Admin core.** Orders table (filter/search/status badges/aging highlight); new-order screen (customer create-or-pick → services → per-service dynamic form from `services.form_fields`; recalc total); order detail with status stepper, forward advance + history logging, backward correction with reason, cancel with reason. *No parse/SMS yet.*

**Phase 3 — Tracking.** Tracking-code already minted in Phase 1 trigger; build `get_tracking_info` RPC + rate-limited `/api/track/[code]` + public `/track/[code]` page (stepper, estimated dates, status copy, Messenger link, privacy note) + friendly not-found; admin tracking panel with QR PNG download + copy-link. *Verify only whitelisted fields cross the boundary.*

**Phase 4 — Shipping + delivery attempts.** Courier dropdown + tracking number required on `released→shipped` (sets `shipped_at`, expected dates); public copy-tracking-number + "Track Delivery" flow; failed-attempt logging with 1/3·2/3·3/3 badges (amber/red); `returned` flow with reason; COD `payment_status` toggle on `delivered` (sets `delivered_at`).

**Phase 5 — Paste & Parse (§9).** Tier-1 rule-based label parser (fuzzy + Taglish synonyms from `form_fields.synonyms`); Tier-2 Anthropic JSON fallback only when required fields empty (strip fences, try/catch, strict JSON→form schema); parsed values fill the **editable** form, highlighted, never auto-saved; graceful failure → blank form + raw paste side-by-side; `parse_logs` written; stubbed when key absent. *(Will consult the `claude-api` skill before writing the Anthropic call.)*

**Phase 6 — SMS (§10).** Semaphore `send()` with stub fallback; per-event toggles + template editor in settings; sends fired on `details_received`, `shipped`, `failed_attempt` (default ON), optional `delivered`; every send written to `notifications_log`; interpolation from DB templates.

**Phase 7 — Sales dashboard (§11).** RPCs computing Booked / Collected / RTS Losses / Cancellations / Net for week/month/custom range (all query-computed, no stored totals); RTS rate + trend; per-service and per-courier breakdowns incl. per-courier RTS rate; returned-orders list with reasons.

---

## 4. Cross-cutting decisions

- **Public data boundary:** exactly one anon-reachable path (`get_tracking_info`), returning the §13 whitelist and nothing else; RLS blocks all direct anon table reads. Failed-attempt/return **reasons** are surfaced publicly (§7 requires them) but customer PII (address, birthdate, parents, form_details, phone) never is.
- **Money:** `price_at_order` snapshots on each item; `total_amount` = trigger/recalc sum; sales figures always computed by query.
- **Dates:** stage math in `lib/dates.ts` — `expected_release_date = processing_start + max(processing_days_max)`, `expected_delivery_date = release + max(shipping_days_estimate)`, rendered in Asia/Manila.
- **Roles:** `admin` for settings/services/couriers/notifications; `staff` for order operations — enforced in RLS and UI.
- **Stubs:** missing external keys degrade gracefully (log, don't throw), so you can run the whole app before adding real Semaphore/Anthropic keys.

---

## Open questions (non-blocking — sensible defaults chosen; tell me to change any)
1. **Aging threshold:** default `processing > 14 days = red`, `> 10 = amber`. OK?
2. **`form_fields` shape:** `[{ key, label, type: 'text'|'date'|'number'|'textarea', required, synonyms: [] }]`. Good?
3. **Sales range basis:** Booked/Cancellations by `created_at`; Collected by `delivered_at`; RTS by `returned_at`. OK?
4. **Rate limit:** ~30 lookups/IP/minute on the public route. OK?

Awaiting your **go-signal** to start Phase 1.
