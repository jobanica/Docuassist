-- =============================================================================
-- 0040_id_address_parts.sql — a checkable address on the ID forms (§5)
--
-- TIN asked for the whole address in one "Complete Address" box, so nothing
-- could be checked against the PSGC — a wrong city or a made-up barangay went
-- straight onto the government form. PhilHealth had barangay and municipality
-- apart already but under keys the place-checker does not recognise, and no
-- province at all.
--
-- Both now carry address_barangay / address_city / address_province, the keys
-- the document place-check keys off (see documentPlacePair). The barangay is
-- checked against that city's real barangays, the city against the province,
-- exactly as a birth certificate's place of event already is.
--
-- The street line stays its own optional field — house number, purok, the
-- things the PSGC has no opinion on and should not gate the check.
-- =============================================================================

update services set form_fields = $$[
  {"key":"account_type","label":"New or existing account?","type":"select","required":true,
   "options":[
     {"value":"new","label":"New — first time applying"},
     {"value":"existing_known","label":"Existing — number known"},
     {"value":"existing_unknown","label":"Existing — number unknown (verification fee)"}]},
  {"key":"tin_number","label":"TIN ID #","type":"text","required":false,
   "synonyms":["tin id","tin id number","tin id no","tin no","tin number","tin","existing tin"]},
  {"key":"last_name","label":"Last Name (Apilyedo)","type":"text","required":true,
   "synonyms":["apilyedo","apelyido","apellido","surname","last name","family name"]},
  {"key":"first_name","label":"First Name","type":"text","required":true,
   "synonyms":["firstname","first name","pangalan","given name"]},
  {"key":"middle_name","label":"Middle Name","type":"text","required":false,
   "synonyms":["middlename","middle name","gitnang pangalan"]},
  {"key":"birthdate","label":"Birthday","type":"date","required":true,
   "synonyms":["birthday","bday","birthdate","date of birth","dob","kapanganakan"]},
  {"key":"civil_status","label":"Civil Status","type":"text","required":true,
   "synonyms":["civil status","cvil status","status","estado","estado sibil"]},
  {"key":"sex","label":"Gender","type":"text","required":true,
   "synonyms":["gender","sex","kasarian"]},
  {"key":"contact_number","label":"Contact #","type":"text","required":true,
   "synonyms":["contact","contact no","contact number","cp","cp no","cp number","cellphone","mobile"]},
  {"key":"house_street","label":"House No. / Street / Purok","type":"text","required":false,
   "synonyms":["house","house no","house number","blk","block","lot","street","purok","st"]},
  {"key":"address_barangay","label":"Barangay","type":"text","required":true,
   "synonyms":["barangay","brgy","bgy","baranggay"]},
  {"key":"address_city","label":"City / Municipality","type":"text","required":true,
   "synonyms":["city","municipality","bayan","town","lungsod"]},
  {"key":"address_province","label":"Province","type":"text","required":true,
   "synonyms":["province","probinsya","lalawigan"]},
  {"key":"zip","label":"ZIP code","type":"text","required":false,
   "synonyms":["zipcode","zip code","zip","postal code"]}
]$$::jsonb
where code = 'tin_id';

update services set form_fields = $$[
  {"key":"account_type","label":"New or existing account?","type":"select","required":true,
   "options":[
     {"value":"new","label":"New — first time applying"},
     {"value":"existing_known","label":"Existing — number known"},
     {"value":"existing_unknown","label":"Existing — number unknown (verification fee)"}]},
  {"key":"philhealth_number","label":"PhilHealth #","type":"text","required":false,
   "synonyms":["philhealth","philhealth no","philhealth number","philhealth id","pin","philhealth pin"]},
  {"key":"last_name","label":"Last Name (Apilyedo)","type":"text","required":true,
   "synonyms":["apilyedo","apelyido","apellido","surname","last name","family name"]},
  {"key":"first_name","label":"First Name (Pangalan)","type":"text","required":true,
   "synonyms":["pangalan","first name","firstname","given name"]},
  {"key":"middle_name","label":"Middle Name","type":"text","required":false,
   "synonyms":["middlename","middle name","gitnang pangalan"]},
  {"key":"birthdate","label":"Birthday","type":"date","required":true,
   "synonyms":["bday","birthday","birthdate","date of birth","dob","kapanganakan"]},
  {"key":"birth_place","label":"Place of Birth","type":"text","required":true,
   "synonyms":["bplace","birthplace","place of birth","lugar ng kapanganakan"]},
  {"key":"sex","label":"Sex","type":"text","required":true,
   "synonyms":["sex","gender","kasarian"]},
  {"key":"civil_status","label":"Civil Status","type":"text","required":true,
   "synonyms":["status","civil status","estado","estado sibil"]},
  {"key":"contact_number","label":"Mobile Number (CP #)","type":"text","required":true,
   "synonyms":["cp","cp no","cp number","contact","contact no","contact number","cellphone","mobile"]},
  {"key":"house_number","label":"House #","type":"text","required":false,
   "synonyms":["house","house no","house number","blk","block","lot"]},
  {"key":"subdivision","label":"Subdivision / Street","type":"text","required":false,
   "synonyms":["subdivision","subd","village","purok","street","st"]},
  {"key":"address_barangay","label":"Barangay","type":"text","required":true,
   "synonyms":["barangay","brgy","bgy","baranggay"]},
  {"key":"address_city","label":"City / Municipality","type":"text","required":true,
   "synonyms":["municipality","city","bayan","town","lungsod"]},
  {"key":"address_province","label":"Province","type":"text","required":true,
   "synonyms":["province","probinsya","lalawigan"]},
  {"key":"zip","label":"ZIP code","type":"text","required":false,
   "synonyms":["zipcode","zip code","zip","postal code"]},
  {"key":"mother_last","label":"Mother — Maiden Last Name","type":"text","required":true,
   "synonyms":["apilyedo sa dalaga pa","apelyido sa dalaga pa","maiden last name","mothers maiden last name","mother last name"]},
  {"key":"mother_first","label":"Mother — First Name","type":"text","required":true,
   "synonyms":["pangalan ng ina","mother first name","mothers first name"]},
  {"key":"mother_middle","label":"Mother — Middle Name","type":"text","required":false,
   "synonyms":["mother middle name","mothers middle name"]}
]$$::jsonb
where code = 'philhealth_id';

-- Carry the old PhilHealth values onto the new keys so nothing already encoded
-- is orphaned by the rename. TIN's single free-text address cannot be split
-- safely, so it is left for staff to re-enter into the parts.
update order_items oi
   set form_details = (form_details - 'barangay' - 'municipality')
     || jsonb_strip_nulls(jsonb_build_object(
          'address_barangay', form_details->>'barangay',
          'address_city',     form_details->>'municipality'))
  from services s
 where s.id = oi.service_id
   and s.code = 'philhealth_id'
   and (form_details ? 'barangay' or form_details ? 'municipality');
