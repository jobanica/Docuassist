-- =============================================================================
-- 0013_public_orders.sql — customer self-service order form + phone OTP.
--
-- Customers open a public link, pick their documents, fill in the details and
-- delivery address, and (when the owner requires it) confirm their mobile
-- number with a one-time code before the order is created.
--
-- SECURITY POSTURE: this is the first public *write* path into the database.
-- Nothing here is granted to `anon`. Every public order operation goes through
-- a Next.js route handler using the service-role key, which rate-limits, mints
-- and checks the OTP, and writes the rows. The browser never touches these
-- tables, and the OTP code never leaves the server in plaintext.
-- =============================================================================

-- --- Where an order came from -------------------------------------------------
alter table orders
  add column if not exists source text not null default 'staff'
    check (source in ('staff', 'public'));

comment on column orders.source is
  'staff = encoded by staff from Messenger; public = submitted by the customer '
  'through the self-service form.';

create index if not exists orders_source_idx on orders (source);

-- --- OTP challenges -----------------------------------------------------------
-- One row per code issued. The code is stored only as a salted hash: a leak of
-- this table must not let anyone complete a verification.
create table if not exists otp_verifications (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,                    -- normalized 09XXXXXXXXX
  code_hash    text not null,
  salt         text not null,
  expires_at   timestamptz not null,
  attempts     int not null default 0,           -- wrong guesses so far
  verified_at  timestamptz,
  -- Opaque token handed back on success; the submit step must present it.
  token        text,
  token_used_at timestamptz,
  ip           text,
  created_at   timestamptz not null default now()
);
create index if not exists otp_phone_idx on otp_verifications (phone, created_at desc);
create index if not exists otp_token_idx on otp_verifications (token);

-- Housekeeping: nothing here is useful for long.
create or replace function purge_expired_otps() returns void
language sql as $$
  delete from otp_verifications where created_at < now() - interval '24 hours';
$$;

-- --- RLS: staff-only, like everything else ------------------------------------
-- The service-role key used by the public routes bypasses RLS; anon has no
-- policy here and no grants, so the browser cannot read or write OTP rows.
alter table otp_verifications enable row level security;

create policy otp_staff_read on otp_verifications
  for select using (is_staff());

revoke all on table otp_verifications from anon;

-- --- Settings -----------------------------------------------------------------
insert into app_settings (key, value) values
  ('public_orders_enabled', 'true'),
  ('otp_required', 'true')
on conflict (key) do nothing;

-- --- SMS template for the OTP itself ------------------------------------------
insert into notification_settings (event_key, enabled, template) values
  ('otp', true,
   'Your DocuAssist PH confirmation code is {code}. It expires in 10 minutes. Do not share this code with anyone.')
on conflict (event_key) do nothing;
