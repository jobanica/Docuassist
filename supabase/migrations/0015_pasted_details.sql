-- Staff intake no longer parses the customer's Messenger reply into fields.
-- Staff paste the reply as-is and it is kept verbatim on the item, so nothing
-- is lost to a parser guessing wrong. The structured form_details stay for the
-- printable PSA forms: customer-submitted orders fill them directly, and staff
-- fill them on the order when they are about to print.
alter table order_items
  add column if not exists pasted_details text;

comment on column order_items.pasted_details is
  'Customer''s filled-out form, pasted verbatim by staff from Messenger.';
