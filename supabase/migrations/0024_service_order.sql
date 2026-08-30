-- =============================================================================
-- 0024_service_order.sql — services in the order the business works in.
--
-- Alphabetical put CENOMAR before the birth certificate and PhilHealth second,
-- which is neither the order staff pick documents in nor the order customers
-- expect to see them. The business order is birth, CENOMAR, marriage, death,
-- then the IDs — busiest first, PSA documents together.
--
-- A column rather than a hardcoded list, so the order can be changed from
-- Settings when a new document is added instead of needing a deploy.
-- =============================================================================

alter table services
  add column if not exists sort_order int not null default 100;

update services set sort_order = 10 where code = 'psa_birth';
update services set sort_order = 20 where code = 'cenomar';
update services set sort_order = 30 where code = 'psa_marriage';
update services set sort_order = 40 where code = 'psa_death';
update services set sort_order = 50 where code = 'tin_id';
update services set sort_order = 60 where code = 'philhealth_id';

-- Anything added since (or by hand) lands after these, in name order, rather
-- than sharing 100 with an arbitrary tie-break.
update services
   set sort_order = 100 + row_number
  from (
    select id, (row_number() over (order by name)) * 10 as row_number
      from services
     where sort_order = 100
  ) ranked
 where services.id = ranked.id;
