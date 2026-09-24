-- Offer ingestion evidence + idempotent identity (additive).
-- Does NOT publish, mint money, or change ranking.
-- MANUAL: apply on staging first. Do NOT apply to production from this phase.
--
-- Architecture:
--   public.offers = canonical offer (unchanged as entity)
--   offers.ingestion_identity_key = stable identity for idempotent pending create
--   public.offer_observations = append-only observations (not a second offers table)
--
-- Identity precedence (application layer):
--   amz:ASIN → ml:ITEM → url:fingerprint
--   meli.la short ids are NOT unique identities (fail open → non-idempotent insert)

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS ingestion_identity_key text NULL;

COMMENT ON COLUMN public.offers.ingestion_identity_key IS
  'Stable ingestion identity (amz:|ml:|url:…). Distinct from product_fingerprint UNIQUE which remains amz|ml only.';

-- One active offer per ingestion identity (pending|approved|published).
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active_ingestion_identity
  ON public.offers (ingestion_identity_key)
  WHERE ingestion_identity_key IS NOT NULL
    AND deleted_at IS NULL
    AND status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text]);

CREATE INDEX IF NOT EXISTS idx_offers_ingestion_identity_lookup
  ON public.offers (ingestion_identity_key)
  WHERE ingestion_identity_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.offer_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid REFERENCES public.offers (id) ON DELETE SET NULL,
  identity_key text NOT NULL,
  idempotency_key text NOT NULL,
  source text NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  raw_url text,
  canonical_url text,
  title text,
  image_url text,
  price numeric,
  previous_price numeric,
  discount numeric,
  seller text,
  availability text,
  coupon text,
  confidence numeric,
  extraction_method text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offer_observations_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_offer_observations_identity_observed
  ON public.offer_observations (identity_key, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_offer_observations_offer_observed
  ON public.offer_observations (offer_id, observed_at DESC)
  WHERE offer_id IS NOT NULL;

COMMENT ON TABLE public.offer_observations IS
  'Append-only product observation for ingestion. Does not replace offers columns. Replay uses idempotency_key.';

ALTER TABLE public.offer_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.offer_observations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.offer_observations TO service_role;
