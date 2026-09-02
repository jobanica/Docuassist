-- =============================================================================
-- 0047_logo_includes_name.sql — telling a full logo lockup from a bare mark
--
-- The tracking header draws the logo and then prints the business name under
-- it. That is right for a logo that is only the icon, and wrong for a full
-- lockup — DocuAssist's own logo has "docuassist ph" set beneath the mark, so
-- the header would say the name twice and shrink the wordmark to something
-- unreadable at icon size.
--
-- Aspect ratio cannot decide this: the real file is a square canvas holding
-- both the mark and the wordmark, so it measures like an icon. So it is asked
-- rather than guessed, as one setting the owner ticks once, and carried on the
-- same public function the header already reads.
-- =============================================================================

create or replace function public.get_public_business_info()
returns json
language sql
stable security definer
set search_path to 'public'
as $$
  select json_build_object(
    'business_name', coalesce((select value from app_settings where key = 'business_name'), 'DocuAssist PH'),
    'messenger_url', (select resolve_messenger_page(null) ->> 'url'),
    'logo_url', nullif((select value from app_settings where key = 'logo_url'), ''),
    -- '1' when the logo image already carries the business name, so the header
    -- shows it larger and does not repeat the name as text underneath.
    'logo_includes_name',
      coalesce((select value from app_settings where key = 'logo_includes_name'), '0') = '1'
  );
$$;
