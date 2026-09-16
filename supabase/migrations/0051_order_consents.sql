-- =============================================================================
-- 0051_order_consents.sql — record the two consents, don't just collect them
--
-- The public order form now shows the fraud warning and asks for two ticks
-- before any personal details are typed: the terms of the service, and
-- permission to process the data at all. These columns are where each one is
-- stamped, per order.
-- =============================================================================

-- Two consents, recorded rather than merely collected.
--
-- A tickbox nobody stores is theatre: the whole point of asking is to be able
-- to say, about one specific order, that this person was shown the warning and
-- agreed on this date. Under the Data Privacy Act the consent to process is
-- the lawful basis for holding the customer's details at all, so it is
-- evidence, not decoration.
--
-- Null on every existing order and on every order staff encode, which is
-- honest: those consents were never taken through this form.
alter table orders
  add column if not exists terms_accepted_at   timestamptz,
  add column if not exists privacy_consent_at  timestamptz;

comment on column orders.terms_accepted_at is
  'When the customer ticked the Terms and Conditions box on the public order '
  'form. Null means it was never asked — a staff-encoded order, or one placed '
  'before the box existed.';
comment on column orders.privacy_consent_at is
  'When the customer consented to processing of their personal data under RA '
  '10173, on the public order form. Null means it was never asked there.';
