-- Hunter Discovery Experiment v1 — additive only.
-- Shadow/observation. Does NOT mint offers. Does NOT change productive gates.
-- service_role only.

CREATE TABLE IF NOT EXISTS public.hunter_discovery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  experiment_id text NOT NULL DEFAULT 'discovery_exp_v1',
  experiment_variant text NOT NULL DEFAULT 'baseline_sticky',
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL,
  retailer text NULL,
  candidate_key text NOT NULL,
  canonical_url text NOT NULL,
  product_fingerprint text NULL,
  product_identifier text NULL,
  title text NULL,
  sale_price numeric(12, 2) NULL,
  original_price numeric(12, 2) NULL,
  discount_pct numeric(8, 2) NULL,
  discount_class text NULL,
  currency text NOT NULL DEFAULT 'MXN',
  rot_page integer NULL,
  rot_seed_id text NULL,
  rot_category_id text NULL,
  rot_query text NULL,
  rot_brand text NULL,
  rot_price_band text NULL,
  axis_bitmap jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hunter_discovery_events_run_idx
  ON public.hunter_discovery_events (run_id);
CREATE INDEX IF NOT EXISTS hunter_discovery_events_url_obs_idx
  ON public.hunter_discovery_events (canonical_url, observed_at DESC);
CREATE INDEX IF NOT EXISTS hunter_discovery_events_fp_obs_idx
  ON public.hunter_discovery_events (product_fingerprint, observed_at DESC)
  WHERE product_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS hunter_discovery_events_exp_obs_idx
  ON public.hunter_discovery_events (experiment_id, observed_at DESC);

COMMENT ON TABLE public.hunter_discovery_events IS
  'Discovery Experiment v1: append-only sightings. Shadow only — never publication.';

ALTER TABLE public.hunter_discovery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hunter_discovery_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_discovery_events TO service_role;

-- Candidate run-state: experiment annotation columns (nullable / additive).
ALTER TABLE public.hunter_offer_candidates
  ADD COLUMN IF NOT EXISTS experiment_id text,
  ADD COLUMN IF NOT EXISTS experiment_variant text,
  ADD COLUMN IF NOT EXISTS discount_class text,
  ADD COLUMN IF NOT EXISTS would_topk_cut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS would_diversity_cut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS persisted_pre_gate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discovery_count_in_run integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_price_sale numeric(12, 2),
  ADD COLUMN IF NOT EXISTS last_price_sale numeric(12, 2),
  ADD COLUMN IF NOT EXISTS price_change_in_run numeric(12, 2),
  ADD COLUMN IF NOT EXISTS rot_page integer,
  ADD COLUMN IF NOT EXISTS rot_seed_id text,
  ADD COLUMN IF NOT EXISTS rot_category_id text,
  ADD COLUMN IF NOT EXISTS rot_query text,
  ADD COLUMN IF NOT EXISTS rot_brand text,
  ADD COLUMN IF NOT EXISTS rot_price_band text,
  ADD COLUMN IF NOT EXISTS axis_bitmap jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.hunter_offer_candidates.discount_class IS
  'Observational discount taxonomy (PARSE_ERROR|UNKNOWN_DISCOUNT|REAL_0_DISCOUNT|LOW_DISCOUNT|OK_ABOVE_MIN). Does not replace productive gate.';
COMMENT ON COLUMN public.hunter_offer_candidates.would_topk_cut IS
  'Simulated: would current topK policy have cut this candidate. Not a policy change.';
COMMENT ON COLUMN public.hunter_offer_candidates.would_diversity_cut IS
  'Simulated: would current diversity policy have cut this candidate. Not a policy change.';
