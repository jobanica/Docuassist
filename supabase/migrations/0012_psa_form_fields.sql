-- =============================================================================
-- 0012_psa_form_fields.sql — align form_fields with the actual PSA application
-- forms, so the printable form can be auto-filled box-for-box.
--
-- The PSA forms print Last / First / Middle name into separate character boxes,
-- for the document owner and for both parents. We previously captured one
-- "Full Name" string per person. Splitting that automatically is unsafe —
-- Filipino surnames are frequently two words ("Dela Cruz", "De Los Santos"),
-- so a guess produces a wrong application and a rejected request. The fields
-- are therefore captured separately at encode time.
--
-- Synonyms are kept generous so Paste & Parse still catches Taglish labels.
-- =============================================================================

update services set form_fields = $json$[
  {"key":"last_name","label":"Last Name","type":"text","required":true,"synonyms":["last name","apelyido","surname","family name"]},
  {"key":"first_name","label":"First Name","type":"text","required":true,"synonyms":["first name","given name","pangalan"]},
  {"key":"middle_name","label":"Middle Name","type":"text","required":false,"synonyms":["middle name","gitnang pangalan","middle"]},
  {"key":"sex","label":"Sex (Male/Female)","type":"text","required":false,"synonyms":["sex","gender","kasarian"]},
  {"key":"date_of_event","label":"Date of Birth","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan","birthday"]},
  {"key":"birth_city","label":"Place of Birth — City / Municipality","type":"text","required":true,"synonyms":["place of birth","lugar ng kapanganakan","pob","city","municipality","bayan"]},
  {"key":"birth_province","label":"Place of Birth — Province","type":"text","required":false,"synonyms":["province","probinsya"]},
  {"key":"birth_country","label":"Country (only if born abroad)","type":"text","required":false,"synonyms":["country","bansa"]},
  {"key":"father_last","label":"Father — Last Name","type":"text","required":false,"synonyms":["father last name","apelyido ng ama","father surname"]},
  {"key":"father_first","label":"Father — First Name","type":"text","required":false,"synonyms":["father first name","pangalan ng ama","father","tatay","ama"]},
  {"key":"father_middle","label":"Father — Middle Name","type":"text","required":false,"synonyms":["father middle name"]},
  {"key":"mother_last","label":"Mother — Maiden Last Name","type":"text","required":false,"synonyms":["mother last name","apelyido ng ina","maiden name","mothers maiden name"]},
  {"key":"mother_first","label":"Mother — First Name","type":"text","required":false,"synonyms":["mother first name","pangalan ng ina","mother","nanay","ina"]},
  {"key":"mother_middle","label":"Mother — Middle Name","type":"text","required":false,"synonyms":["mother middle name"]},
  {"key":"bren","label":"Birth Reference No. (BReN, if known)","type":"text","required":false,"synonyms":["bren","birth reference","reference number"]},
  {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin","gagamitin"]},
  {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya","number of copies"]}
]$json$::jsonb
where code = 'psa_birth';

-- CENOMAR asks for the same owner + parent details as the birth certificate.
update services set form_fields = (select form_fields from services where code = 'psa_birth')
where code = 'cenomar';

update services set form_fields = $json$[
  {"key":"husband_last","label":"Husband — Last Name","type":"text","required":true,"synonyms":["husband last name","apelyido ng lalaki","groom last name"]},
  {"key":"husband_first","label":"Husband — First Name","type":"text","required":true,"synonyms":["husband first name","husband","groom","asawang lalaki","lalaki"]},
  {"key":"husband_middle","label":"Husband — Middle Name","type":"text","required":false,"synonyms":["husband middle name"]},
  {"key":"wife_last","label":"Wife — Maiden Last Name","type":"text","required":true,"synonyms":["wife last name","apelyido ng babae","bride last name","maiden name"]},
  {"key":"wife_first","label":"Wife — First Name","type":"text","required":true,"synonyms":["wife first name","wife","bride","asawang babae","babae"]},
  {"key":"wife_middle","label":"Wife — Middle Name","type":"text","required":false,"synonyms":["wife middle name"]},
  {"key":"date_of_event","label":"Date of Marriage","type":"date","required":true,"synonyms":["date of marriage","kasal","wedding date","petsa ng kasal"]},
  {"key":"marriage_city","label":"Place of Marriage — City / Municipality","type":"text","required":true,"synonyms":["place of marriage","lugar ng kasal","city","municipality"]},
  {"key":"marriage_province","label":"Place of Marriage — Province","type":"text","required":false,"synonyms":["province","probinsya"]},
  {"key":"marriage_country","label":"Country (only if married abroad)","type":"text","required":false,"synonyms":["country","bansa"]},
  {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
  {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
]$json$::jsonb
where code = 'psa_marriage';

update services set form_fields = $json$[
  {"key":"last_name","label":"Deceased — Last Name","type":"text","required":true,"synonyms":["last name","apelyido","surname"]},
  {"key":"first_name","label":"Deceased — First Name","type":"text","required":true,"synonyms":["first name","pangalan","given name"]},
  {"key":"middle_name","label":"Deceased — Middle Name","type":"text","required":false,"synonyms":["middle name","gitnang pangalan"]},
  {"key":"sex","label":"Sex (Male/Female)","type":"text","required":false,"synonyms":["sex","gender","kasarian"]},
  {"key":"date_of_event","label":"Date of Death","type":"date","required":true,"synonyms":["date of death","namatay","death date","petsa ng kamatayan"]},
  {"key":"death_city","label":"Place of Death — City / Municipality","type":"text","required":true,"synonyms":["place of death","lugar ng kamatayan","city","municipality"]},
  {"key":"death_province","label":"Place of Death — Province","type":"text","required":false,"synonyms":["province","probinsya"]},
  {"key":"death_country","label":"Country (only if died abroad)","type":"text","required":false,"synonyms":["country","bansa"]},
  {"key":"bren","label":"Birth Reference No. (BReN, if known)","type":"text","required":false,"synonyms":["bren","birth reference"]},
  {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin","gagamitin"]},
  {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
]$json$::jsonb
where code = 'psa_death';
