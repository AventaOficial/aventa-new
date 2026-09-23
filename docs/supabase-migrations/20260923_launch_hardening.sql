-- Launch hardening: freshness queue, search document, funnel events, account purge columns.
-- Additive and idempotent. Apply in Supabase SQL editor (staging first).
-- EXTERNAL: this file does not run itself. MANUAL VERIFICATION required.

-- ---------------------------------------------------------------------------
-- Freshness
-- ---------------------------------------------------------------------------

ALTER TABLE public.offer_health_state
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_score numeric,
  ADD COLUMN IF NOT EXISTS last_error text;

DO $$
DECLARE r record;
BEGIN
  IF to_regclass('public.offer_health_state') IS NULL THEN
    RETURN;
  END IF;
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.offer_health_state'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.offer_health_state DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.offer_health_state
  DROP CONSTRAINT IF EXISTS offer_health_state_status_check;

ALTER TABLE public.offer_health_state
  ADD CONSTRAINT offer_health_state_status_check
  CHECK (status IN ('available', 'price_changed', 'out_of_stock', 'unknown', 'error'));

CREATE INDEX IF NOT EXISTS idx_offer_health_state_next_check
  ON public.offer_health_state (next_check_at ASC);

COMMENT ON COLUMN public.offer_health_state.status IS
  'available=healthy, out_of_stock=unavailable, unknown=inconclusive, error=check failed. price_changed stays visible.';

CREATE TABLE IF NOT EXISTS public.offer_freshness_scan_state (
  id text PRIMARY KEY,
  cursor_offer_id uuid,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_batch_limit integer,
  last_scanned integer,
  last_errors integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offer_freshness_scan_state ENABLE ROW LEVEL SECURITY;

INSERT INTO public.offer_health_state (
  offer_id, status, last_checked_at, next_check_at, consecutive_failures, diagnostic, updated_at
)
SELECT
  o.id,
  'unknown',
  now(),
  now() + ((abs(hashtext(o.id::text)) % 48) || ' hours')::interval,
  0,
  'awaiting_first_check',
  now()
FROM public.offers o
WHERE o.status IN ('approved', 'published')
  AND o.deleted_at IS NULL
  AND (o.expires_at IS NULL OR o.expires_at > now())
  AND NOT EXISTS (
    SELECT 1 FROM public.offer_health_state h WHERE h.offer_id = o.id
  );

UPDATE public.offer_health_state h
SET next_check_at = now()
WHERE h.next_check_at IS NULL
  AND h.status = 'price_changed';

UPDATE public.offer_health_state h
SET next_check_at = now() + ((abs(hashtext(h.offer_id::text)) % 48) || ' hours')::interval
WHERE h.next_check_at IS NULL;

CREATE OR REPLACE FUNCTION public.enqueue_offer_freshness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('approved', 'published') AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.offer_health_state (
      offer_id, status, last_checked_at, next_check_at, consecutive_failures, diagnostic, updated_at
    )
    VALUES (NEW.id, 'unknown', now(), now(), 0, 'awaiting_first_check', now())
    ON CONFLICT (offer_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_offer_freshness ON public.offers;
CREATE TRIGGER trg_enqueue_offer_freshness
  AFTER INSERT OR UPDATE OF status, deleted_at ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_offer_freshness();

-- ---------------------------------------------------------------------------
-- Postgres-native search
-- ---------------------------------------------------------------------------

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS search_document tsvector;

CREATE OR REPLACE FUNCTION public.offers_refresh_search_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.search_document :=
    setweight(to_tsvector('spanish', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.store, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.category, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(array_to_string(NEW.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(left(NEW.description, 2000), '')), 'C');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offers_search_document ON public.offers;
CREATE TRIGGER trg_offers_search_document
  BEFORE INSERT OR UPDATE OF title, store, category, tags, description ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.offers_refresh_search_document();

UPDATE public.offers
SET search_document =
  setweight(to_tsvector('spanish', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('spanish', coalesce(store, '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(category, '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(array_to_string(tags, ' '), '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(left(description, 2000), '')), 'C')
WHERE search_document IS NULL;

CREATE INDEX IF NOT EXISTS idx_offers_search_document
  ON public.offers USING gin (search_document);

CREATE OR REPLACE FUNCTION public.search_public_offers(
  p_query text,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_categories text[] DEFAULT NULL,
  p_store text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  title text,
  price numeric,
  original_price numeric,
  image_url text,
  image_urls text[],
  msi_months integer,
  bank_coupon text,
  store text,
  offer_url text,
  description text,
  hunter_comment text,
  steps text,
  conditions text,
  coupons text,
  created_at timestamptz,
  created_by uuid,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('spanish', left(coalesce(p_query, ''), 80)) AS tsq
  )
  SELECT
    o.id,
    o.title,
    o.price,
    o.original_price,
    o.image_url,
    o.image_urls,
    o.msi_months,
    o.bank_coupon,
    o.store,
    o.offer_url,
    o.description,
    o.hunter_comment,
    o.steps,
    o.conditions,
    o.coupons,
    o.created_at,
    o.created_by,
    ts_rank_cd(o.search_document, q.tsq) AS rank
  FROM public.offers o
  CROSS JOIN q
  WHERE o.status IN ('approved', 'published')
    AND o.deleted_at IS NULL
    AND (o.expires_at IS NULL OR o.expires_at > now())
    AND o.search_document @@ q.tsq
    AND (p_categories IS NULL OR o.category = ANY (p_categories))
    AND (p_store IS NULL OR o.store = p_store)
    AND NOT EXISTS (
      SELECT 1 FROM public.offer_health_state h
      WHERE h.offer_id = o.id AND h.status = 'out_of_stock'
    )
  ORDER BY rank DESC, o.created_at DESC
  LIMIT least(greatest(coalesce(p_limit, 20), 1), 50)
  OFFSET least(greatest(coalesce(p_offset, 0), 0), 500);
$$;

REVOKE ALL ON FUNCTION public.search_public_offers(text, integer, integer, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_offers(text, integer, integer, text[], text) TO service_role;

-- ---------------------------------------------------------------------------
-- First-party funnel events (not a replacement for offer_events)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  anonymous_id text,
  offer_id uuid,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text
);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_events_dedupe
  ON public.product_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_name_time
  ON public.product_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_offer_events_created_at
  ON public.offer_events (created_at DESC);

-- ---------------------------------------------------------------------------
-- Account deletion purge bookkeeping. Does not delete financial tables.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_purge_after timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_anonymized_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_auth_deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_purged_at timestamptz;

CREATE TABLE IF NOT EXISTS public.account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phase text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_due
  ON public.profiles (deletion_purge_after)
  WHERE deletion_purged_at IS NULL AND account_deletion_requested_at IS NOT NULL;

COMMENT ON TABLE public.account_deletion_audit IS
  'Deletion audit. Retained. Not PII beyond user id.';
