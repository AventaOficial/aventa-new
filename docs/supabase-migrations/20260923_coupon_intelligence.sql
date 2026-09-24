-- Coupon intelligence. Additive. Does not publish offers or move money.
-- History rows are append-only. Expiry does not delete the coupon.
-- MANUAL VERIFICATION: apply in Supabase after staging.

CREATE TABLE IF NOT EXISTS public.coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_key text NOT NULL UNIQUE,
  store text NOT NULL,
  code text NOT NULL,
  discount_type text NOT NULL,
  discount_value numeric,
  max_discount numeric,
  minimum_purchase numeric,
  currency text,
  applies_to text NOT NULL,
  restrictions text,
  expires_at timestamptz,
  status text NOT NULL,
  verification_status text NOT NULL,
  confidence numeric NOT NULL,
  source_class text NOT NULL,
  source_url text,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupons_store_status
  ON public.coupons (store, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_coupons_expires
  ON public.coupons (expires_at);

CREATE TABLE IF NOT EXISTS public.coupon_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons (id),
  event_type text NOT NULL,
  changes text[] NOT NULL DEFAULT '{}',
  idempotency_key text NOT NULL UNIQUE,
  observed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_events_coupon
  ON public.coupon_events (coupon_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.coupon_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons (id),
  target_type text NOT NULL CHECK (target_type IN ('store', 'category', 'product', 'offer')),
  target_key text NOT NULL,
  matched boolean NOT NULL DEFAULT false,
  uncertain boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coupon_id, target_type, target_key)
);

CREATE INDEX IF NOT EXISTS idx_coupon_links_target
  ON public.coupon_links (target_type, target_key);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.coupons FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coupon_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.coupon_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.coupons TO service_role;
GRANT ALL ON TABLE public.coupon_events TO service_role;
GRANT ALL ON TABLE public.coupon_links TO service_role;

COMMENT ON TABLE public.coupons IS
  'Canonical coupon. offers.coupons stays the free-text note. This table is the intelligence record. Expiration does not delete history.';
