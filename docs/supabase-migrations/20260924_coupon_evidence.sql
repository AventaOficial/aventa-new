-- Additive coupon evidence. Safe if 20260923_coupon_intelligence.sql is already applied.
-- Does not delete coupons. Staging first, then production.
-- MANUAL VERIFICATION.

ALTER TABLE public.coupon_links
  ADD COLUMN IF NOT EXISTS eligibility text NOT NULL DEFAULT 'exists';

ALTER TABLE public.coupon_links
  DROP CONSTRAINT IF EXISTS coupon_links_eligibility_check;

ALTER TABLE public.coupon_links
  ADD CONSTRAINT coupon_links_eligibility_check
  CHECK (eligibility IN ('exists', 'eligible', 'verified_for_offer'));

ALTER TABLE public.coupon_events
  ADD COLUMN IF NOT EXISTS source_class text;

ALTER TABLE public.coupon_events
  ADD COLUMN IF NOT EXISTS actor_role text;

CREATE INDEX IF NOT EXISTS idx_coupon_events_observed
  ON public.coupon_events (observed_at DESC);

CREATE TABLE IF NOT EXISTS public.coupon_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons (id),
  offer_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('coupon_view', 'coupon_copy', 'outbound_open')),
  correlation_id text NOT NULL,
  relation text NOT NULL CHECK (relation IN ('none', 'correlated', 'ambiguous', 'unknown')),
  idempotency_key text NOT NULL UNIQUE,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_interactions_offer
  ON public.coupon_interactions (offer_id, event_type, observed_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupon_interactions_correlation
  ON public.coupon_interactions (correlation_id);

ALTER TABLE public.coupon_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.coupon_interactions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.coupon_interactions TO service_role;

COMMENT ON TABLE public.coupon_interactions IS
  'Copy, view and outbound are separate events. A click is not a conversion. No PII.';
