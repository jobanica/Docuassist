-- =============================================================================
-- 0023_peso_sign.sql — one peso sign, not two.
--
-- The seeded copy wrote "₱{total}", but {total} is filled by peso(), which
-- already formats the amount with the sign. Customers were reading
-- "₱₱685.00" on the tracking page and in the COD reminders — the two places
-- where the amount matters most.
--
-- Only the literal sign in front of the token is removed; the amount and its
-- formatting are untouched.
-- =============================================================================

update order_statuses
   set public_helper = replace(public_helper, '₱{total}', '{total}')
 where public_helper like '%₱{total}%';

update notification_settings
   set template = replace(template, '₱{total}', '{total}')
 where template like '%₱{total}%';
