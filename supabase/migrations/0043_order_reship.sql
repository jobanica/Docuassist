-- =============================================================================
-- 0043_order_reship.sql — reshipping a returned parcel
--
-- After three failed delivery attempts a parcel comes back to the office and
-- the order is marked Returned to Sender — a lost sale. Sometimes the customer
-- then gets in touch and asks for it to be sent again. That parcel is still on
-- the shelf; nothing needs remaking, it just needs to go back out.
--
-- "Reship" is that move: it takes the order off Returned and back to Released,
-- ready to hand to a courier again with a fresh tracking number. It is not a
-- new status — reshipping just puts the order back into the normal outbound
-- flow — so it is recorded as two marks on the order:
--   reshipped_at  — when it was last sent back out
--   reship_count  — how many times (a parcel can bounce more than once)
-- Both are what the orders board filters and badges on, so a reship can be
-- found again later however far along it has since travelled.
--
-- The move itself (reset delivery_attempts, clear the return, stamp these) is
-- done in the staff server action, the same way markReturned/markShipped write
-- the order directly — no function is needed here, only the two columns.
-- =============================================================================

alter table orders
  add column if not exists reshipped_at timestamptz,
  add column if not exists reship_count integer not null default 0;

comment on column orders.reshipped_at is
  'When a returned parcel was last sent back out for delivery.';
comment on column orders.reship_count is
  'How many times this order has been reshipped after a return. 0 = never.';
