-- =============================================================================
-- 0044_reship_request.sql — flagging a reship before the parcel is back
--
-- 0043 added the reship action, but it can only run once the returned parcel
-- is physically in hand. In practice the customer often calls while the parcel
-- is still in transit back to the office — "please just send it again". Staff
-- had nowhere to put that: they'd have to remember it, and hope whoever opens
-- the box days later knows to resend rather than shelve it.
--
-- This adds the request as its own mark, separate from the act. reship_requested_at
-- is set the moment the customer asks — allowed while the order is still Shipped
-- (the parcel is on its way back) or already Returned. It survives Mark as
-- Returned, so when the document is received the order shows plainly that a
-- reship is waiting and staff can send it straight back out. The act of
-- reshipping (or the order being delivered/cancelled instead) clears it.
-- =============================================================================

alter table orders
  add column if not exists reship_requested_at timestamptz;

comment on column orders.reship_requested_at is
  'Set when the customer asks for a reship, possibly while the parcel is still '
  'in transit back. Cleared when the order is reshipped, delivered, or cancelled.';
