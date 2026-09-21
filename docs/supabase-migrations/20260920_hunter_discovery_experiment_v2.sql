-- Hunter Discovery Experiment v2 — additive only.
-- Shadow/observation. Does NOT mint offers. Does NOT change productive gates.
-- service_role only.

-- Events: richer discount evidence columns
ALTER TABLE public.hunter_discovery_events
  ADD COLUMN IF NOT EXISTS discount_class_v1 text,
  ADD COLUMN IF NOT EXISTS discount_confidence text,
  ADD COLUMN IF NOT EXISTS discount_source text,
  ADD COLUMN IF NOT EXISTS historical_price_confidence text,
  ADD COLUMN IF NOT EXISTS price_evidence jsonb;

COMMENT ON COLUMN public.hunter_discovery_events.discount_class IS
  'Observational discount taxonomy v2 (DISCOUNT_REAL_GOOD|DISCOUNT_REAL_LOW|DISCOUNT_UNKNOWN|DISCOUNT_INVALID|DISCOUNT_MISSING_PRICE). UNKNOWN ≠ rejected.';
COMMENT ON COLUMN public.hunter_discovery_events.discount_class_v1 IS
  'Dual-label legacy v1 class for A/C comparison. Observation only.';

-- Candidates: shadow what-if + funnel + evidence
ALTER TABLE public.hunter_offer_candidates
  ADD COLUMN IF NOT EXISTS discount_class_v1 text,
  ADD COLUMN IF NOT EXISTS discount_confidence text,
  ADD COLUMN IF NOT EXISTS discount_source text,
  ADD COLUMN IF NOT EXISTS historical_price_confidence text,
  ADD COLUMN IF NOT EXISTS price_evidence jsonb,
  ADD COLUMN IF NOT EXISTS current_decision text,
  ADD COLUMN IF NOT EXISTS hypothetical_decision text,
  ADD COLUMN IF NOT EXISTS funnel_stage text,
  ADD COLUMN IF NOT EXISTS funnel_reason text;

COMMENT ON COLUMN public.hunter_offer_candidates.discount_class IS
  'Observational discount taxonomy v2. Does not replace productive gate. UNKNOWN ≠ rejected.';
COMMENT ON COLUMN public.hunter_offer_candidates.hypothetical_decision IS
  'What-if without discount gate (WOULD_CONTINUE|STILL_REJECTED|SAME_AS_CURRENT|WOULD_INSERT). Observation only — never publishes.';
COMMENT ON COLUMN public.hunter_offer_candidates.funnel_stage IS
  'Terminal funnel stage (DISCOVERY|DISCOUNT_CLASSIFICATION|SCORE|TOP_K|DIVERSITY|WOULD_INSERT). Zero silent drops.';

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_discount_class_idx
  ON public.hunter_offer_candidates (discount_class)
  WHERE discount_class IS NOT NULL;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_experiment_v2_idx
  ON public.hunter_offer_candidates (experiment_id, experiment_variant, discovered_at DESC)
  WHERE experiment_id IS NOT NULL;
