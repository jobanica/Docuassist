-- =============================================================================
-- 0037_shipping_fee.sql — the shipping fee inside every price (§8, §11)
--
-- Every service is priced as the document plus one trip to the customer:
--
--   PSA birth / marriage / death, TIN, PhilHealth   500 + 185 = 685
--   CENOMAR                                         550 + 185 = 735
--
-- That is why combining orders changes the price. Two death certificates in
-- one parcel are two documents but one delivery, so the second ₱185 is not
-- owed — ₱1,370 becomes ₱1,185, not because anyone is being generous but
-- because the customer is only being shipped to once.
--
-- The fee lives in settings, not in code: couriers raise their rates, and that
-- is not worth a deploy. It is a single figure because it is the same ₱185 on
-- every document today; the day it stops being, this is the one place to look.
-- =============================================================================

insert into app_settings (key, value) values ('shipping_fee', '185')
on conflict (key) do nothing;

-- Unparseable or missing counts as zero rather than failing the screen that
-- reads it: a blank box in Settings must not stop staff combining orders.
create or replace function public.shipping_fee()
returns numeric
language sql
stable
as $$
  select coalesce((
    select case when value ~ '^\s*[0-9]+(\.[0-9]+)?\s*$'
                then value::numeric else 0 end
      from app_settings where key = 'shipping_fee'
  ), 0);
$$;

grant execute on function public.shipping_fee() to authenticated, service_role;
