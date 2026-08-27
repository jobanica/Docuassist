-- =============================================================================
-- 0005_seed.sql — seed statuses, services, couriers, SMS templates, settings
-- Idempotent (on conflict do nothing / update).
-- =============================================================================

-- --- Order statuses (6 pipeline + 2 terminal) with public helper copy (§7) ----
insert into order_statuses (code, label, sort_order, is_terminal, public_helper) values
  ('new_inquiry',      'New Inquiry',      1, false,
     'We received your inquiry! Please send us your complete details so we can start.'),
  ('details_received', 'Details Received', 2, false,
     'Salamat! We got your details. Your order is queued to be processed.'),
  ('processing',       'Processing',       3, false,
     'Your documents are being processed. This usually takes 1–2 weeks.'),
  ('released',         'Released',         4, false,
     'Your document has been released and is being prepared for shipping.'),
  ('shipped',          'Shipped',          5, false,
     'Your documents are on the way via {courier}! Tracking #: {number}. Please prepare ₱{total} for cash on delivery.'),
  ('delivered',        'Delivered',        6, true,
     'Delivered na! Salamat sa pagtitiwala sa DocuAssist PH. 💙'),
  ('cancelled',        'Cancelled',        7, true,
     'This order was cancelled. Message our page if you have questions.'),
  ('returned',         'Returned to Sender', 8, true,
     'Your parcel was returned to us after 3 delivery attempts. Please message our page to arrange redelivery.')
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order,
      is_terminal = excluded.is_terminal,
      public_helper = excluded.public_helper;

-- --- Services (§1) with per-type form_fields --------------------------------
-- Certificate group: birth / cenomar / marriage / death
-- ID group: tin_id / philhealth_id
insert into services (code, name, price, processing_days_min, processing_days_max, shipping_days_estimate, form_fields, active) values
  ('psa_birth', 'PSA Birth Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name on Record","type":"text","required":true,"synonyms":["full name","pangalan","name","name on certificate"]},
      {"key":"date_of_event","label":"Date of Birth","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan","birthday"]},
      {"key":"place_of_event","label":"Place of Birth","type":"text","required":true,"synonyms":["place of birth","lugar ng kapanganakan","pob"]},
      {"key":"fathers_name","label":"Father''s Name","type":"text","required":false,"synonyms":["father","fathers name","tatay","ama","pangalan ng ama"]},
      {"key":"mothers_maiden_name","label":"Mother''s Maiden Name","type":"text","required":false,"synonyms":["mother","mothers maiden name","nanay","ina","pangalan ng ina","maiden name"]},
      {"key":"requester_relationship","label":"Requester''s Relationship","type":"text","required":false,"synonyms":["relationship","relasyon","kaugnayan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin","gagamitin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya","number of copies"]}
    ]'::jsonb, true),
  ('cenomar', 'CENOMAR (No Marriage Record)', 465, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name on Record","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"date_of_event","label":"Date of Birth","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"place_of_event","label":"Place of Birth","type":"text","required":true,"synonyms":["place of birth","lugar ng kapanganakan"]},
      {"key":"fathers_name","label":"Father''s Name","type":"text","required":false,"synonyms":["father","tatay","ama"]},
      {"key":"mothers_maiden_name","label":"Mother''s Maiden Name","type":"text","required":false,"synonyms":["mother","nanay","ina","maiden name"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('psa_marriage', 'PSA Marriage Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Husband''s Full Name","type":"text","required":true,"synonyms":["husband","asawang lalaki","groom","full name"]},
      {"key":"spouse_name","label":"Wife''s Full Name","type":"text","required":true,"synonyms":["wife","asawang babae","bride","spouse"]},
      {"key":"date_of_event","label":"Date of Marriage","type":"date","required":true,"synonyms":["date of marriage","kasal","wedding date"]},
      {"key":"place_of_event","label":"Place of Marriage","type":"text","required":true,"synonyms":["place of marriage","lugar ng kasal"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('psa_death', 'PSA Death Certificate', 430, 7, 14, 7,
    '[
      {"key":"full_name_on_record","label":"Full Name of Deceased","type":"text","required":true,"synonyms":["deceased","namatay","full name"]},
      {"key":"date_of_event","label":"Date of Death","type":"date","required":true,"synonyms":["date of death","namatay","death date"]},
      {"key":"place_of_event","label":"Place of Death","type":"text","required":true,"synonyms":["place of death","lugar ng kamatayan"]},
      {"key":"requester_relationship","label":"Requester''s Relationship","type":"text","required":false,"synonyms":["relationship","relasyon","kaugnayan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]},
      {"key":"copies","label":"No. of Copies","type":"number","required":false,"synonyms":["copies","kopya"]}
    ]'::jsonb, true),
  ('tin_id', 'TIN ID', 500, 7, 14, 7,
    '[
      {"key":"full_name","label":"Full Name","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"birthdate","label":"Birthdate","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"existing_number","label":"Existing TIN (if any)","type":"text","required":false,"synonyms":["tin","tin number","existing tin"]},
      {"key":"address","label":"Address","type":"text","required":false,"synonyms":["address","tirahan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]}
    ]'::jsonb, true),
  ('philhealth_id', 'PhilHealth ID', 500, 7, 14, 7,
    '[
      {"key":"full_name","label":"Full Name","type":"text","required":true,"synonyms":["full name","pangalan","name"]},
      {"key":"birthdate","label":"Birthdate","type":"date","required":true,"synonyms":["birthdate","date of birth","dob","kapanganakan"]},
      {"key":"existing_number","label":"Existing PhilHealth No. (if any)","type":"text","required":false,"synonyms":["philhealth","philhealth number","pin"]},
      {"key":"address","label":"Address","type":"text","required":false,"synonyms":["address","tirahan"]},
      {"key":"purpose","label":"Purpose","type":"text","required":false,"synonyms":["purpose","layunin"]}
    ]'::jsonb, true)
on conflict (code) do nothing;

-- --- Couriers (§5) — general tracking pages, no per-number deep links --------
insert into couriers (name, tracking_page_url, active) values
  ('J&T Express', 'https://www.jtexpress.ph/trajectoryQuery', true),
  ('LBC',         'https://www.lbcexpress.com/track/',        true),
  ('Flash Express','https://www.flashexpress.ph/tracking/',   true)
on conflict do nothing;

-- --- SMS templates + toggles (§10) — failed_attempt defaults ON --------------
insert into notification_settings (event_key, enabled, template) values
  ('details_received', true,  'Order confirmed! Track here: {link}'),
  ('shipped',          true,  'Your documents are on the way via {courier}. COD ₱{total}. Track: {link}'),
  ('failed_attempt',   true,  'Hi {name}, delivery attempt {n}/3 for your DocuAssist PH order was unsuccessful. Courier will retry — please keep your phone on and prepare ₱{total} COD. {link}'),
  ('delivered',        false, 'Salamat, {name}! Your DocuAssist PH order was delivered. We appreciate your trust. 💙')
on conflict (event_key) do nothing;

-- --- App settings -----------------------------------------------------------
insert into app_settings (key, value) values
  ('business_name', 'DocuAssist PH'),
  ('messenger_url', 'https://m.me/DocuAssistPH'),
  ('logo_url', '')
on conflict (key) do nothing;
