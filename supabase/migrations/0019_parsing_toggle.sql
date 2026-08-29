-- =============================================================================
-- 0019_parsing_toggle.sql — auto-fill (parsing) is opt-in, admin-controlled.
--
-- Tier 1 is rule-based and free, so it defaults ON. Tier 2 calls the Anthropic
-- API and costs money per parse, so it defaults OFF — nobody should discover
-- the AI fallback by way of a bill. Both are settings rather than env vars so
-- the admin can turn them off mid-day without a redeploy.
-- =============================================================================
insert into app_settings (key, value) values
  ('parsing_enabled',    'true'),
  ('parsing_ai_enabled', 'false')
on conflict (key) do nothing;
