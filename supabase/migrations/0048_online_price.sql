-- =============================================================================
-- 0048_online_price.sql — two price lists, one per channel
--
-- The same document is not worth the same through both doors. An order a
-- customer places on the website is paid before anything is filed, so the
-- money is in hand and there is no failed-delivery risk to carry. An order
-- staff encode is cash on delivery: the fee is paid to the PSA up front and
-- only recovered if the parcel is actually accepted, and three failed attempts
-- means it never is. The COD price carries that risk; the prepaid one doesn't.
--
-- So `price` stays exactly what it was — the COD price staff quote and the
-- figure every existing order was booked at — and `online_price` is what the
-- public form charges. Null means "no separate online price", and the channel
-- falls back to `price`, so a service nobody has set one for still works.
--
-- Nothing here touches existing orders: order_items snapshot price_at_order
-- when they are created, which is the whole reason that column exists.
-- =============================================================================

alter table services
  add column if not exists online_price numeric(10, 2);

comment on column services.online_price is
  'What the public order form charges (paid before processing). Null falls '
  'back to price, which is the cash-on-delivery figure staff quote.';

-- Seed the prices advertised on the landing page.
update services set online_price = 365 where code in ('psa_birth', 'psa_marriage', 'psa_death');
update services set online_price = 420 where code = 'cenomar';
-- The IDs carry no PSA fee, so the two channels charge the same.
update services set online_price = 275 where code in ('tin_id', 'philhealth_id');
