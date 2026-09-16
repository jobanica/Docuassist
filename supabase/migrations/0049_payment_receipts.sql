-- =============================================================================
-- 0049_payment_receipts.sql — proof of payment, and the state it puts an order
-- into while someone checks it
--
-- On the prepaid route the customer pays before anything is filed, so the
-- money arrives as a screenshot rather than as cash at the door. The order is
-- created first either way — an abandoned one is still a lead — and only
-- becomes 'paid' when a person has looked at the proof and said so.
-- =============================================================================

-- A private bucket: a receipt screenshot carries a name, an amount and a
-- reference number. Unlike the logo and the payment QR, none of that belongs
-- on a public URL, so staff read it through short-lived signed links exactly
-- as they do the identity papers in `requirements`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 8 * 1024 * 1024,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create table if not exists payment_receipts (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders(id) on delete cascade,
  -- Path inside the private bucket. The row is the index; deleting it is what
  -- the app treats as deleting the file.
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint,
  created_at   timestamptz not null default now()
);

create index if not exists payment_receipts_order_idx
  on payment_receipts (order_id, created_at);

alter table payment_receipts enable row level security;

-- Same scope as the order it belongs to. There is deliberately no public
-- policy: the customer uploads through a server route holding the service
-- key, which checks their tracking code first.
drop policy if exists payment_receipts_staff_select on payment_receipts;
create policy payment_receipts_staff_select on payment_receipts
  for select using (is_staff() and staff_can_see_order(order_id));

drop policy if exists payment_receipts_staff_delete on payment_receipts;
create policy payment_receipts_staff_delete on payment_receipts
  for delete using (is_staff() and staff_can_see_order(order_id));

-- --- Where a prepaid order sits while the money is being checked -----------
-- payment_status stays the truth ('paid' once accepted). These record how it
-- got there, and let the board show the ones still waiting on someone.
alter table orders
  add column if not exists payment_submitted_at   timestamptz,
  add column if not exists payment_verified_at    timestamptz,
  add column if not exists payment_verified_by    uuid references staff_users(id) on delete set null,
  add column if not exists payment_rejected_at    timestamptz,
  add column if not exists payment_rejected_reason text;

comment on column orders.payment_submitted_at is
  'When the customer said they had paid (and usually attached a receipt). '
  'Set on the public order flow; means "waiting for someone to check it".';
comment on column orders.payment_rejected_reason is
  'Why a submitted payment was not accepted. Shown to the customer so they '
  'know what to re-send.';
