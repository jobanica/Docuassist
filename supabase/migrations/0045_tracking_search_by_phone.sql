-- =============================================================================
-- 0045_tracking_search_by_phone.sql — centralized tracking search
--
-- Until now the only way in was the private per-order link (an unguessable
-- code). This adds a second way: a customer types their phone number on a
-- single public page and sees all their orders, each linking to its own
-- tracking page. The private links keep working exactly as before.
--
-- The phone number is the key, deliberately, NOT the name. A name is easy to
-- guess, and this business handles PSA and other government documents — an
-- open name search would let a stranger see who ordered what. A phone number
-- is something the customer knows and a stranger generally does not, so it
-- gates the lookup the way the private code does for the single-order page.
-- The name, when given, only narrows the matches; it never widens them.
--
-- Same shape as get_tracking_info's guarantees: a SECURITY DEFINER function,
-- granted to anon, returning only whitelisted fields — no address, no contact
-- number, no money. Every table stays blocked by RLS. Callers are rate-limited
-- by IP in the app layer, the same limiter the single-order lookup uses.
-- =============================================================================

create or replace function public.search_tracking_by_phone(
  p_phone text, p_name text default null
)
returns json
language sql
stable
security definer
set search_path = public
as $$
  -- Match on the last 10 digits, so "0917 123 4567", "+63 917 123 4567" and
  -- "639171234567" all find the same person. Fewer than 10 digits is treated
  -- as no phone at all — it stops a short string enumerating the whole table.
  with norm as (
    select right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10) as phone10
  )
  select coalesce(json_agg(row order by (row->>'created_at') desc), '[]'::json)
  from (
    select json_build_object(
      'tracking_code',          o.tracking_code,
      'first_name',             split_part(trim(cu.full_name), ' ', 1),
      'status',                 o.status,
      'status_label',           st.label,
      'status_sort_order',      st.sort_order,
      'is_terminal',            st.is_terminal,
      'is_delayed',             (o.delayed_at is not null),
      'expected_delivery_date', o.expected_delivery_date,
      'created_at',             o.created_at,
      'documents', (
        select coalesce(json_agg(json_build_object(
                 'service_name', s.name,
                 'quantity',     oi.quantity,
                 -- Same owner-name rule as get_tracking_info: a marriage
                 -- certificate names both spouses, everything else one person,
                 -- and an unfilled form simply has no name yet.
                 'owner_name', nullif(
                   case
                     when coalesce(oi.form_details->>'husband_last', '') <> ''
                       or coalesce(oi.form_details->>'wife_last', '') <> ''
                     then concat_ws(' & ',
                            nullif(concat_ws(' ',
                              nullif(trim(oi.form_details->>'husband_first'), ''),
                              nullif(trim(oi.form_details->>'husband_last'),  '')), ''),
                            nullif(concat_ws(' ',
                              nullif(trim(oi.form_details->>'wife_first'), ''),
                              nullif(trim(oi.form_details->>'wife_last'),  '')), ''))
                     else concat_ws(' ',
                            nullif(trim(oi.form_details->>'first_name'),  ''),
                            nullif(trim(oi.form_details->>'middle_name'), ''),
                            nullif(trim(oi.form_details->>'last_name'),   ''))
                   end, '')
               ) order by s.name), '[]'::json)
          from order_items oi
          join services s on s.id = oi.service_id
         where oi.order_id = o.id
      )
    ) as row
    from orders o
    join customers cu on cu.id = o.customer_id
    join order_statuses st on st.code = o.status
    cross join norm
    where length(norm.phone10) = 10
      and right(regexp_replace(coalesce(cu.phone, ''), '\D', '', 'g'), 10) = norm.phone10
      -- A combined order's documents live on the keeper; its own link already
      -- redirects, and listing the empty shell here would just confuse.
      and o.merged_into is null
      and (
        p_name is null or trim(p_name) = ''
        or cu.full_name ilike '%' || trim(p_name) || '%'
      )
  ) t;
$$;

grant execute on function public.search_tracking_by_phone(text, text)
  to anon, authenticated, service_role;
