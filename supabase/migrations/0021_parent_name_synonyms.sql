-- =============================================================================
-- 0021_parent_name_synonyms.sql — the ways customers actually name the parents.
-- The parser splits whatever matches across Last / First / Middle, so these only
-- need to catch the wording; the three boxes are filled from one line.
-- =============================================================================
update services
   set form_fields = (
     select jsonb_agg(
       case
         when f->>'key' in ('father_first', 'mother_first') then
           jsonb_set(f, '{synonyms}',
             to_jsonb(array(
               select distinct e from unnest(
                 array(select jsonb_array_elements_text(coalesce(f->'synonyms','[]'::jsonb)))
                 || case f->>'key'
                      when 'father_first' then array[
                        'name of father','fathers name','father name',
                        'buong pangalan ng ama','pangalan ng tatay','tatay',
                        'ama','father full name']
                      else array[
                        'name of mother','mothers name','mother name',
                        'buong pangalan ng ina','pangalan ng nanay','nanay',
                        'ina','mother full name','mothers maiden name',
                        'maiden name ng ina']
                    end
               ) e
             ))
           )
         else f
       end
       order by ord
     )
     from jsonb_array_elements(form_fields) with ordinality t(f, ord)
   )
 where form_fields @> '[{"key":"father_first"}]'
    or form_fields @> '[{"key":"mother_first"}]';
