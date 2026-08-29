-- =============================================================================
-- 0020_full_name_synonyms.sql — customers write "Full Name:", not "First Name:".
-- Without these the owner's own name was the one field auto-fill missed, which
-- is the one that matters most on the form. The parser splits the matched value
-- across Last / First / Middle.
-- =============================================================================
update services
   set form_fields = (
     select jsonb_agg(
       case
         when f->>'key' = 'first_name' then
           jsonb_set(f, '{synonyms}',
             to_jsonb(array(
               select distinct e from unnest(
                 array(select jsonb_array_elements_text(coalesce(f->'synonyms','[]'::jsonb)))
                 || array['full name','buong pangalan','complete name','name of applicant','pangalan ng aplikante']
               ) e
             ))
           )
         else f
       end
       order by ord
     )
     from jsonb_array_elements(form_fields) with ordinality t(f, ord)
   )
 where form_fields @> '[{"key":"first_name"}]';
