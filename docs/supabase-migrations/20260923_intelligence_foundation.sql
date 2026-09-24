-- Intelligence rollups and bounded demand aggregation.
-- Additive. Does not publish offers or move money.
-- Raw snapshots are not rewritten.
-- MANUAL VERIFICATION: apply in Supabase after staging.

CREATE TABLE IF NOT EXISTS public.price_intelligence_rollups (
  idempotency_key text PRIMARY KEY,
  subject_type text NOT NULL CHECK (subject_type IN ('offer', 'product')),
  subject_key text NOT NULL,
  window_days integer NOT NULL CHECK (window_days IN (7, 30, 90)),
  as_of_date date NOT NULL,
  currency text,
  sample_count integer NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  current_price numeric(12, 2),
  min_price numeric(12, 2),
  max_price numeric(12, 2),
  median_price numeric(12, 2),
  trend text,
  volatility numeric,
  confidence numeric,
  latest_observed_at timestamptz,
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_intelligence_rollups_subject
  ON public.price_intelligence_rollups (subject_type, subject_key, as_of_date DESC);

ALTER TABLE public.price_intelligence_rollups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.price_intelligence_rollups FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.price_intelligence_rollups TO service_role;

COMMENT ON TABLE public.price_intelligence_rollups IS
  'Derived price knowledge. Raw rows stay in product_price_snapshots and offer_price_snapshots. Offer raw retention target is 180 days after a rollup exists. Product daily rows are kept. Not applied automatically.';

-- Window scan stays on created_at. Offer-id indexes already exist for the per-offer counts.
CREATE INDEX IF NOT EXISTS idx_offer_events_created_at
  ON public.offer_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offer_favorites_offer_id
  ON public.offer_favorites (offer_id, created_at DESC);

-- Bounded demand census. Hard-capped at 7 days and 100 offers inside the function.
-- Event-led: an offer with votes but no offer_events in the window is absent.
-- Counts only. No user id. product_events is excluded so funnel mirrors are not double-counted.
-- Positive votes only. Approved comments only.

CREATE OR REPLACE FUNCTION public.demand_offer_signals(p_since timestamptz, p_limit integer)
RETURNS TABLE (
  offer_id uuid,
  views bigint,
  outbound bigint,
  votes bigint,
  saves bigint,
  comments bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT GREATEST(p_since, now() - interval '7 days') AS since_at
  ),
  ranked AS (
    SELECT
      e.offer_id,
      count(*) FILTER (WHERE e.event_type = 'view')::bigint AS views,
      count(*) FILTER (WHERE e.event_type = 'outbound')::bigint AS outbound
    FROM public.offer_events e
    CROSS JOIN window_start w
    WHERE e.created_at >= w.since_at
    GROUP BY e.offer_id
    ORDER BY count(*) FILTER (WHERE e.event_type = 'outbound') DESC, count(*) DESC
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  SELECT
    r.offer_id,
    r.views,
    r.outbound,
    (
      SELECT count(*)::bigint
      FROM public.offer_votes v
      CROSS JOIN window_start w
      WHERE v.offer_id = r.offer_id
        AND v.created_at >= w.since_at
        AND v.value > 0
    ) AS votes,
    (
      SELECT count(*)::bigint
      FROM public.offer_favorites f
      CROSS JOIN window_start w
      WHERE f.offer_id = r.offer_id
        AND f.created_at >= w.since_at
    ) AS saves,
    (
      SELECT count(*)::bigint
      FROM public.comments c
      CROSS JOIN window_start w
      WHERE c.offer_id = r.offer_id
        AND c.created_at >= w.since_at
        AND c.status = 'approved'
    ) AS comments
  FROM ranked r;
$$;

REVOKE ALL ON FUNCTION public.demand_offer_signals(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.demand_offer_signals(timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.demand_offer_signals(timestamptz, integer) IS
  'Demand counts for at most 7 days and 100 offers. Not a ranking input. No PII.';
