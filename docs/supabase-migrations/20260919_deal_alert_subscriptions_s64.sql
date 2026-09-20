-- S6.4 — Deal Alert subscriptions persistence + candidate retrieval RPC
-- STAGING-FIRST. Do NOT apply to production without explicit approval.
-- Money-path tables untouched.
--
-- Design notes:
-- - Canonical AlertSubscription store (not profiles.preferred_categories).
-- - text[] + GIN for stores/categories (multi-value; no CROSS JOIN explosion).
-- - Scalar columns for enabled + minimum_discount_percent (btree-friendly).
-- - Soft-disable via enabled=false (audit-friendly); hard DELETE allowed for owner.
-- - Snapshot semantics: candidate RPC returns a single ordered snapshot.
-- - version int for optimistic concurrency on user updates.
-- - is_broad structural flag (empty stores OR empty categories) — not ML scoring.

CREATE TABLE IF NOT EXISTS public.deal_alert_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  stores text[] NOT NULL DEFAULT '{}'::text[],
  categories text[] NOT NULL DEFAULT '{}'::text[],
  minimum_discount_percent numeric(5, 2) NOT NULL,
  notification_channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  cooldown_seconds integer NOT NULL,
  daily_cap integer NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_broad boolean NOT NULL DEFAULT false,
  fanout_class text NOT NULL DEFAULT 'narrow'
    CHECK (fanout_class IN ('narrow', 'broad', 'high_fanout')),
  contract_version text NOT NULL DEFAULT 'deal-alerts.v1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_alert_subscriptions_discount_range
    CHECK (
      minimum_discount_percent >= 20
      AND minimum_discount_percent <= 95
    ),
  CONSTRAINT deal_alert_subscriptions_cooldown_range
    CHECK (cooldown_seconds >= 3600 AND cooldown_seconds <= 604800),
  CONSTRAINT deal_alert_subscriptions_daily_cap_range
    CHECK (daily_cap >= 1 AND daily_cap <= 20),
  CONSTRAINT deal_alert_subscriptions_stores_cap
    CHECK (cardinality(stores) <= 8),
  CONSTRAINT deal_alert_subscriptions_categories_cap
    CHECK (cardinality(categories) <= 12),
  CONSTRAINT deal_alert_subscriptions_channels_nonempty
    CHECK (cardinality(notification_channels) >= 1)
);

COMMENT ON TABLE public.deal_alert_subscriptions IS
  'S6.4 Deal Alerts subscription source of truth. No delivery status. No money fields.';
COMMENT ON COLUMN public.deal_alert_subscriptions.is_broad IS
  'Structural: empty stores OR empty categories (wildcard dimension).';
COMMENT ON COLUMN public.deal_alert_subscriptions.fanout_class IS
  'Structural class: narrow | broad | high_fanout (both wildcards). Not a score.';
COMMENT ON COLUMN public.deal_alert_subscriptions.version IS
  'Optimistic concurrency token for user updates.';

-- Cap subscriptions per user (soft enforcement also in app).
CREATE UNIQUE INDEX IF NOT EXISTS deal_alert_subscriptions_user_id_id_uidx
  ON public.deal_alert_subscriptions (user_id, id);

CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_user_enabled_idx
  ON public.deal_alert_subscriptions (user_id, enabled);

-- Candidate path: enabled + threshold (partial).
CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_enabled_discount_idx
  ON public.deal_alert_subscriptions (enabled, minimum_discount_percent)
  WHERE enabled = true;

-- Multi-value membership via GIN (overlap / contains).
CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_stores_gin
  ON public.deal_alert_subscriptions USING GIN (stores);

CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_categories_gin
  ON public.deal_alert_subscriptions USING GIN (categories);

-- Broad / high-fanout identification for orchestration (S6.5+).
CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_fanout_class_idx
  ON public.deal_alert_subscriptions (fanout_class)
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS deal_alert_subscriptions_updated_at_idx
  ON public.deal_alert_subscriptions (updated_at DESC);

-- Normalize + classify on write
CREATE OR REPLACE FUNCTION public.deal_alert_subscriptions_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  store_count int;
  cat_count int;
BEGIN
  NEW.stores := COALESCE(
    (
      SELECT array_agg(DISTINCT lower(trim(x)) ORDER BY lower(trim(x)))
      FROM unnest(COALESCE(NEW.stores, '{}'::text[])) AS x
      WHERE length(trim(x)) > 0
    ),
    '{}'::text[]
  );
  NEW.categories := COALESCE(
    (
      SELECT array_agg(DISTINCT lower(trim(x)) ORDER BY lower(trim(x)))
      FROM unnest(COALESCE(NEW.categories, '{}'::text[])) AS x
      WHERE length(trim(x)) > 0
    ),
    '{}'::text[]
  );
  NEW.notification_channels := COALESCE(
    (
      SELECT array_agg(DISTINCT lower(trim(x)) ORDER BY lower(trim(x)))
      FROM unnest(COALESCE(NEW.notification_channels, '{}'::text[])) AS x
      WHERE length(trim(x)) > 0
    ),
    ARRAY['in_app']::text[]
  );

  store_count := cardinality(NEW.stores);
  cat_count := cardinality(NEW.categories);
  NEW.is_broad := (store_count = 0 OR cat_count = 0);
  IF store_count = 0 AND cat_count = 0 THEN
    NEW.fanout_class := 'high_fanout';
  ELSIF NEW.is_broad THEN
    NEW.fanout_class := 'broad';
  ELSE
    NEW.fanout_class := 'narrow';
  END IF;

  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    -- version bumped by app on intentional update; ensure never decreases
    IF NEW.version < OLD.version THEN
      RAISE EXCEPTION 'deal_alert_subscriptions version cannot decrease';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deal_alert_subscriptions_before_write
  ON public.deal_alert_subscriptions;
CREATE TRIGGER trg_deal_alert_subscriptions_before_write
  BEFORE INSERT OR UPDATE ON public.deal_alert_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.deal_alert_subscriptions_before_write();

-- RLS
ALTER TABLE public.deal_alert_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_alert_subscriptions_select_own
  ON public.deal_alert_subscriptions;
CREATE POLICY deal_alert_subscriptions_select_own
  ON public.deal_alert_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS deal_alert_subscriptions_insert_own
  ON public.deal_alert_subscriptions;
CREATE POLICY deal_alert_subscriptions_insert_own
  ON public.deal_alert_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS deal_alert_subscriptions_update_own
  ON public.deal_alert_subscriptions;
CREATE POLICY deal_alert_subscriptions_update_own
  ON public.deal_alert_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS deal_alert_subscriptions_delete_own
  ON public.deal_alert_subscriptions;
CREATE POLICY deal_alert_subscriptions_delete_own
  ON public.deal_alert_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Candidate retrieval RPC — service_role / backend only.
-- Returns candidateLimit+1 rows so callers can detect overflow without silent truncate.
CREATE OR REPLACE FUNCTION public.deal_alert_find_candidates(
  p_store text DEFAULT NULL,
  p_merchant text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_discount numeric DEFAULT NULL,
  p_enabled_only boolean DEFAULT true,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  enabled boolean,
  stores text[],
  categories text[],
  minimum_discount_percent numeric,
  notification_channels text[],
  cooldown_seconds integer,
  daily_cap integer,
  version integer,
  is_broad boolean,
  fanout_class text,
  contract_version text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH params AS (
    SELECT
      NULLIF(lower(trim(p_store)), '') AS store_tok,
      NULLIF(lower(trim(p_merchant)), '') AS merchant_tok,
      NULLIF(lower(trim(p_category)), '') AS category_tok,
      p_discount AS discount,
      GREATEST(1, LEAST(COALESCE(p_limit, 1000), 5000)) AS lim
  )
  SELECT
    s.id,
    s.user_id,
    s.enabled,
    s.stores,
    s.categories,
    s.minimum_discount_percent,
    s.notification_channels,
    s.cooldown_seconds,
    s.daily_cap,
    s.version,
    s.is_broad,
    s.fanout_class,
    s.contract_version
  FROM public.deal_alert_subscriptions s
  CROSS JOIN params p
  WHERE
    (NOT p_enabled_only OR s.enabled = true)
    AND (
      p.discount IS NULL
      OR s.minimum_discount_percent <= p.discount
    )
    AND (
      CASE
        WHEN p.store_tok IS NULL AND p.merchant_tok IS NULL THEN
          cardinality(s.stores) = 0
        ELSE
          cardinality(s.stores) = 0
          OR (p.store_tok IS NOT NULL AND s.stores @> ARRAY[p.store_tok])
          OR (p.merchant_tok IS NOT NULL AND s.stores @> ARRAY[p.merchant_tok])
      END
    )
    AND (
      CASE
        WHEN p.category_tok IS NULL THEN
          cardinality(s.categories) = 0
        ELSE
          cardinality(s.categories) = 0
          OR s.categories @> ARRAY[p.category_tok]
      END
    )
  ORDER BY s.id ASC
  LIMIT (SELECT lim + 1 FROM params);
$$;

REVOKE ALL ON FUNCTION public.deal_alert_find_candidates(
  text, text, text, numeric, boolean, integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deal_alert_find_candidates(
  text, text, text, numeric, boolean, integer
) FROM anon;
REVOKE ALL ON FUNCTION public.deal_alert_find_candidates(
  text, text, text, numeric, boolean, integer
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deal_alert_find_candidates(
  text, text, text, numeric, boolean, integer
) TO service_role;

COMMENT ON FUNCTION public.deal_alert_find_candidates IS
  'S6.4 coarse candidate retrieval. Fine decision remains decideDealAlert (S6.2).';
