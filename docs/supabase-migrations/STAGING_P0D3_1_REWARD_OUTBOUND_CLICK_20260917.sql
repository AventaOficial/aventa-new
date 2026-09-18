-- =============================================================================
-- AVENTA STAGING ONLY — P0-D3.1 reward_outbound_clicks (attribution persistence)
-- Target project-ref: oojshofrpbfwsiypcecr
-- NEVER run on production (mkgsrpsuvedwwlzmzmzh)
-- =============================================================================
-- Mirrors production canonical schema:
--   20260830_rewards_v1.sql (table base + RLS + indexes)
--   20260916_attribution_foundation_clicks.sql (additive columns + indexes)
-- Does NOT create: creator_rewards, reward_payouts, ledger, settlements, money.
-- Does NOT copy rows from production.
-- Idempotent. No DROP / TRUNCATE / mass DELETE.
-- =============================================================================

DO $$
BEGIN
  -- Fail-closed staging marker: coexistence legacy table exists on staging, not on prod.
  IF to_regclass('public.ofertas') IS NULL THEN
    RAISE EXCEPTION
      'P0D3.1 ABORT: public.ofertas missing — refusing apply (not staging coexistence)';
  END IF;
  IF to_regclass('public.offers') IS NULL THEN
    RAISE EXCEPTION 'P0D3.1 ABORT: public.offers missing';
  END IF;
END $$;

-- ── Base table (rewards_v1 clicks only) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_outbound_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  product_fingerprint text NULL,
  clicker_user_id uuid NULL,
  ip_hash text NULL,
  user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_offer_created
  ON public.reward_outbound_clicks (offer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_product_created
  ON public.reward_outbound_clicks (product_fingerprint, created_at DESC)
  WHERE product_fingerprint IS NOT NULL AND btrim(product_fingerprint) <> '';

-- ── Attribution foundation columns (additive) ────────────────────────────────
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_reward_outbound_clicks_idempotency
  ON public.reward_outbound_clicks (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_channel_created
  ON public.reward_outbound_clicks (channel, created_at DESC)
  WHERE channel IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_campaign_created
  ON public.reward_outbound_clicks (campaign_key, created_at DESC)
  WHERE campaign_key IS NOT NULL AND btrim(campaign_key) <> '';

-- ── RLS + minimal grants (match production) ──────────────────────────────────
ALTER TABLE public.reward_outbound_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM anon;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM authenticated;
GRANT ALL ON TABLE public.reward_outbound_clicks TO service_role;

SELECT 'p0d3_1_reward_outbound_clicks_staging_ok' AS step;
