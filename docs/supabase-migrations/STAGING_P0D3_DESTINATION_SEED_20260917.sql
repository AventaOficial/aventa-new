-- =============================================================================
-- AVENTA STAGING ONLY — P0-D3 synthetic Distribution destination seed
-- Target: oojshofrpbfwsiypcecr
-- NEVER run on production (mkgsrpsuvedwwlzmzmzh)
-- =============================================================================
-- Destination stays DISABLED. No real Telegram chat_id.
-- credential_ref = env var name only (TELEGRAM_BOT_TOKEN_STAGING).
-- external_destination_key = STAGING_UNSET until ops provision a staging chat.
-- =============================================================================

INSERT INTO public.distribution_brands (id, slug, display_name, status)
VALUES (
  'c1111111-1111-4111-8111-111111111101',
  'aventa-staging',
  'Aventa Staging',
  'active'
)
ON CONFLICT (slug) DO UPDATE
SET display_name = EXCLUDED.display_name,
    updated_at = now();

INSERT INTO public.distribution_destinations (
  id,
  brand_id,
  provider,
  slug,
  display_name,
  external_destination_key,
  credential_ref,
  status,
  kind,
  category_ids,
  tracking_campaign_key
)
VALUES (
  'c2222222-2222-4222-8222-222222222201',
  'c1111111-1111-4111-8111-111111111101',
  'telegram',
  'telegram-staging-test',
  'Telegram Staging Test',
  'STAGING_UNSET',
  'TELEGRAM_BOT_TOKEN_STAGING',
  'disabled',
  'general',
  '{}'::text[],
  'tg-staging-test'
)
ON CONFLICT (slug) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  credential_ref = EXCLUDED.credential_ref,
  status = 'disabled',
  external_destination_key = CASE
    WHEN public.distribution_destinations.external_destination_key = 'STAGING_UNSET'
      THEN EXCLUDED.external_destination_key
    ELSE public.distribution_destinations.external_destination_key
  END,
  updated_at = now();

SELECT 'p0d3_staging_destination_seed_ok' AS step;
