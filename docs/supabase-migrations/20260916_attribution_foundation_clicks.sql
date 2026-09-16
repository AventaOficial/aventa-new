-- Attribution Foundation — columnas aditivas en reward_outbound_clicks.
-- Idempotente. No toca money path. No backfill inventado.
-- Rollback: DROP COLUMN IF EXISTS de las columnas nuevas + DROP INDEX.

ALTER TABLE public.reward_outbound_clicks
  ADD COLUMN IF NOT EXISTS channel text NULL,
  ADD COLUMN IF NOT EXISTS campaign_key text NULL,
  ADD COLUMN IF NOT EXISTS destination_url text NULL,
  ADD COLUMN IF NOT EXISTS original_destination_url text NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text NULL,
  ADD COLUMN IF NOT EXISTS attribution_meta jsonb NULL;

COMMENT ON COLUMN public.reward_outbound_clicks.channel IS
  'Canal de acquisition (taxonomía server-side). Nunca confiar ciegamente en cliente.';
COMMENT ON COLUMN public.reward_outbound_clicks.campaign_key IS
  'Clave de campaña opcional (allowlisted/server-resolved). Null si desconocida.';
COMMENT ON COLUMN public.reward_outbound_clicks.destination_url IS
  'URL afiliada/destino al momento del click (desde offers.offer_url DB).';
COMMENT ON COLUMN public.reward_outbound_clicks.original_destination_url IS
  'URL producto original si existe (offers.original_offer_url). Separada de destination afiliada.';
COMMENT ON COLUMN public.reward_outbound_clicks.idempotency_key IS
  'Clave determinista anti-duplicado (offer+actor+ventana). UNIQUE parcial.';
COMMENT ON COLUMN public.reward_outbound_clicks.attribution_meta IS
  'Metadata de attribution (sin PII). merchant_network, source, completeness flags.';

-- UNIQUE parcial: solo filas con key no-nula.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_outbound_clicks_idempotency
  ON public.reward_outbound_clicks (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_channel_created
  ON public.reward_outbound_clicks (channel, created_at DESC)
  WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_campaign_created
  ON public.reward_outbound_clicks (campaign_key, created_at DESC)
  WHERE campaign_key IS NOT NULL AND btrim(campaign_key) <> '';
