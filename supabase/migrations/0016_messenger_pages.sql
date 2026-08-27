-- =============================================================================
-- 0016_messenger_pages.sql — more than one Facebook page.
--
-- The business runs separate pages for different lines of work (the VA who
-- handles TIN and PhilHealth IDs answers on her own page). A tracking link that
-- always points at the main page sends those customers to staff who can't help
-- them, so the page is now chosen per order by whoever encodes it.
--
-- Each staff member gets a default page, so the VA's orders carry hers without
-- her having to remember; the picker on the order still overrides it.
-- =============================================================================

create table if not exists messenger_pages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  active      boolean not null default true,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Exactly one default. A partial unique index makes a second one impossible
-- rather than merely discouraged.
create unique index if not exists messenger_pages_one_default
  on messenger_pages (is_default) where is_default;

alter table orders
  add column if not exists messenger_page_id uuid
    references messenger_pages(id) on delete set null;

alter table staff_users
  add column if not exists default_messenger_page_id uuid
    references messenger_pages(id) on delete set null;

-- Staff-only, like every other table. The public reaches page URLs only
-- through the whitelisted tracking RPCs below.
alter table messenger_pages enable row level security;
drop policy if exists messenger_pages_staff_all on messenger_pages;
create policy messenger_pages_staff_all on messenger_pages
  for all using (is_staff()) with check (is_staff());

-- Carry the existing single link over as the default page so nothing changes
-- for orders that were created before this.
insert into messenger_pages (name, url, is_default)
select
  coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
  value,
  true
from app_settings
where key = 'messenger_url'
  and coalesce(value, '') <> ''
  and not exists (select 1 from messenger_pages);

-- -----------------------------------------------------------------------------
-- Resolve the page a tracking link should point at: the order's own page, else
-- the default page, else the legacy app_settings value. One place, so the
-- tracking page and the order screen can never disagree.
-- -----------------------------------------------------------------------------
create or replace function public.resolve_messenger_page(p_page_id uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select json_build_object('name', name, 'url', url)
       from messenger_pages where id = p_page_id and active),
    (select json_build_object('name', name, 'url', url)
       from messenger_pages where is_default and active),
    (select json_build_object(
              'name', coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
              'url', value)
       from app_settings where key = 'messenger_url' and coalesce(value, '') <> '')
  );
$$;

revoke all on function public.resolve_messenger_page(uuid) from public;
-- Not granted to anon: it is only ever called from inside the RPCs below,
-- which run as definer. Anon has no way to enumerate pages by id.
grant execute on function public.resolve_messenger_page(uuid) to service_role;

-- The public business info now resolves through the same helper.
create or replace function public.get_public_business_info()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'business_name', coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
    'messenger_url', (select resolve_messenger_page(null) ->> 'url'),
    'logo_url', nullif((select value from app_settings where key = 'logo_url'), '')
  );
$$;

revoke all on function public.get_public_business_info() from public;
grant execute on function public.get_public_business_info() to anon, authenticated, service_role;
