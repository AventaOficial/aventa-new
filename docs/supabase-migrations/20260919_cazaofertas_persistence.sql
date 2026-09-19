-- CazaOfertasss FASE 1 — Persistencia canónica
-- STAGING-FIRST. Do NOT apply to production without explicit approval.
-- Money-path Aventa untouched (no creator_rewards / payout_intents / commissions / settlement).
--
-- Tables:
--   1. caza_deal_candidates  — identity_key UNIQUE, revision atómica
--   2. caza_publications     — publication_id UNIQUE (idempotencia de publisher)
--   3. caza_revenue_events   — append-only ledger (no UPDATE/DELETE económicos)
--
-- Access model (RLS):
--   ALL THREE: server-only (service_role). REVOKE from anon/authenticated.
--   Revenue ledger: NEVER client-readable (financial).
--   Candidates / publications: server-only in FASE 1 (no user-facing product yet).

-- ---------------------------------------------------------------------------
-- 1) caza_deal_candidates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_deal_candidates (
  id text PRIMARY KEY,
  identity_key text NOT NULL,
  store text NOT NULL
    CHECK (store IN ('mercadolibre_mx', 'amazon_mx')),
  external_product_id text NULL,
  identity_strategy text NOT NULL
    CHECK (identity_strategy IN ('external_product_id', 'canonical_url')),
  canonical_url text NOT NULL,
  title text NOT NULL,
  current_price numeric(12, 2) NOT NULL
    CHECK (current_price > 0),
  reference_price numeric(12, 2) NULL
    CHECK (reference_price IS NULL OR reference_price > 0),
  discount_percent integer NOT NULL
    CHECK (discount_percent >= 0 AND discount_percent <= 99),
  currency text NOT NULL
    CHECK (currency = 'MXN'),
  category text NOT NULL,
  availability text NOT NULL
    CHECK (availability IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  status text NOT NULL
    CHECK (status IN ('DISCOVERED', 'VALIDATED', 'REJECTED', 'PUBLICATION_READY', 'EXPIRED')),

  -- seller (typed columns)
  seller_external_id text NULL,
  seller_display_name text NULL,
  seller_trust_class text NOT NULL
    CHECK (seller_trust_class IN ('official_store', 'high', 'medium', 'low', 'unknown')),
  seller_reputation_score numeric(8, 4) NULL,

  -- score (typed + secondary jsonb for reasons[])
  score_value integer NOT NULL
    CHECK (score_value >= 0 AND score_value <= 100),
  score_grade text NOT NULL
    CHECK (score_grade IN ('GREAT_DEAL', 'GOOD_DEAL', 'REJECT')),
  score_version text NOT NULL,
  score_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_gates_failed text[] NOT NULL DEFAULT '{}'::text[],

  -- evidence (typed columns; evidence_json is secondary snapshot only)
  evidence_source text NOT NULL,
  evidence_captured_at timestamptz NOT NULL,
  evidence_current_price numeric(12, 2) NOT NULL
    CHECK (evidence_current_price > 0),
  evidence_reference_price numeric(12, 2) NULL
    CHECK (evidence_reference_price IS NULL OR evidence_reference_price > 0),
  evidence_currency text NOT NULL
    CHECK (evidence_currency = 'MXN'),
  evidence_quality text NOT NULL
    CHECK (evidence_quality IN ('strong', 'moderate', 'weak', 'unusable')),
  evidence_price_confidence text NOT NULL
    CHECK (evidence_price_confidence IN ('verified', 'reported', 'unverified')),
  evidence_historical_confidence text NOT NULL
    CHECK (evidence_historical_confidence IN (
      'observed_history', 'store_reference_price', 'page_claimed', 'none'
    )),
  evidence_observation_window_days integer NULL
    CHECK (evidence_observation_window_days IS NULL OR evidence_observation_window_days >= 0),
  evidence_observation_count integer NULL
    CHECK (evidence_observation_count IS NULL OR evidence_observation_count >= 0),
  evidence_coupon_applied boolean NOT NULL DEFAULT false,
  evidence_promotion_applied boolean NOT NULL DEFAULT false,
  evidence_notes text NULL,
  evidence_json jsonb NULL,

  -- affiliate metadata
  affiliate_url text NULL,
  affiliate_network text NULL
    CHECK (
      affiliate_network IS NULL
      OR affiliate_network IN ('mercadolibre_affiliates', 'amazon_associates_mx')
    ),
  affiliate_tracking_label text NULL,
  affiliate_generated_at timestamptz NULL,
  affiliate_credential_ref text NULL,
  monetizable boolean NOT NULL DEFAULT false,
  publication_eligible boolean NOT NULL DEFAULT false,

  detected_at timestamptz NOT NULL,
  first_seen_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1
    CHECK (revision >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT caza_deal_candidates_identity_key_uidx UNIQUE (identity_key)
);

COMMENT ON TABLE public.caza_deal_candidates IS
  'CazaOfertasss FASE 1 — DealCandidate persistence. Independent of Aventa money path.';
COMMENT ON COLUMN public.caza_deal_candidates.identity_key IS
  'Canonical identity (store+externalProductId or URL hash). UNIQUE.';
COMMENT ON COLUMN public.caza_deal_candidates.revision IS
  'Monotonic revision. Incremented atomically by BEFORE UPDATE trigger on material change.';
COMMENT ON COLUMN public.caza_deal_candidates.evidence_json IS
  'Secondary structured snapshot only — typed evidence_* columns are the source of truth.';
COMMENT ON COLUMN public.caza_deal_candidates.score_reasons IS
  'Secondary: explainable score reasons[]. score_value/grade are typed primary.';

CREATE INDEX IF NOT EXISTS caza_deal_candidates_status_identity_idx
  ON public.caza_deal_candidates (status, identity_key);

CREATE INDEX IF NOT EXISTS caza_deal_candidates_store_updated_idx
  ON public.caza_deal_candidates (store, updated_at DESC);

CREATE INDEX IF NOT EXISTS caza_deal_candidates_publication_eligible_idx
  ON public.caza_deal_candidates (publication_eligible, status)
  WHERE publication_eligible = true;

-- Atomic revision: ignore client-supplied revision; preserve identity + first_seen_at.
CREATE OR REPLACE FUNCTION public.caza_deal_candidates_before_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  material_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := COALESCE(NULLIF(NEW.revision, 0), 1);
    IF NEW.revision < 1 THEN
      NEW.revision := 1;
    END IF;
    NEW.first_seen_at := COALESCE(NEW.first_seen_at, NEW.detected_at, now());
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := COALESCE(NEW.updated_at, now());
    RETURN NEW;
  END IF;

  -- UPDATE path (used by ON CONFLICT DO UPDATE)
  NEW.id := OLD.id;
  NEW.identity_key := OLD.identity_key;
  NEW.first_seen_at := OLD.first_seen_at;
  NEW.created_at := OLD.created_at;

  material_changed := (
       NEW.current_price IS DISTINCT FROM OLD.current_price
    OR NEW.reference_price IS DISTINCT FROM OLD.reference_price
    OR NEW.discount_percent IS DISTINCT FROM OLD.discount_percent
    OR NEW.availability IS DISTINCT FROM OLD.availability
    OR NEW.affiliate_url IS DISTINCT FROM OLD.affiliate_url
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.score_value IS DISTINCT FROM OLD.score_value
    OR NEW.score_grade IS DISTINCT FROM OLD.score_grade
    OR NEW.evidence_captured_at IS DISTINCT FROM OLD.evidence_captured_at
    OR NEW.seller_trust_class IS DISTINCT FROM OLD.seller_trust_class
  );

  IF material_changed THEN
    NEW.revision := OLD.revision + 1;
  ELSE
    NEW.revision := OLD.revision;
  END IF;

  NEW.updated_at := COALESCE(NEW.updated_at, now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_caza_deal_candidates_before_write
  ON public.caza_deal_candidates;
CREATE TRIGGER trg_caza_deal_candidates_before_write
  BEFORE INSERT OR UPDATE ON public.caza_deal_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.caza_deal_candidates_before_write();

-- Atomic upsert RPC: single round-trip, concurrency-safe revision.
CREATE OR REPLACE FUNCTION public.caza_upsert_deal_candidate(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_revision integer;
  v_was_insert boolean;
  v_row public.caza_deal_candidates%ROWTYPE;
  v_action text;
BEGIN
  IF p_row IS NULL OR p_row->>'identity_key' IS NULL OR length(trim(p_row->>'identity_key')) = 0 THEN
    RAISE EXCEPTION 'caza_upsert_deal_candidate: identity_key required';
  END IF;
  IF p_row->>'id' IS NULL OR length(trim(p_row->>'id')) = 0 THEN
    RAISE EXCEPTION 'caza_upsert_deal_candidate: id required';
  END IF;

  SELECT revision INTO v_existing_revision
  FROM public.caza_deal_candidates
  WHERE identity_key = p_row->>'identity_key'
  FOR UPDATE;

  v_was_insert := NOT FOUND;

  INSERT INTO public.caza_deal_candidates AS t (
    id, identity_key, store, external_product_id, identity_strategy,
    canonical_url, title, current_price, reference_price, discount_percent,
    currency, category, availability, status,
    seller_external_id, seller_display_name, seller_trust_class, seller_reputation_score,
    score_value, score_grade, score_version, score_reasons, score_gates_failed,
    evidence_source, evidence_captured_at, evidence_current_price, evidence_reference_price,
    evidence_currency, evidence_quality, evidence_price_confidence, evidence_historical_confidence,
    evidence_observation_window_days, evidence_observation_count,
    evidence_coupon_applied, evidence_promotion_applied, evidence_notes, evidence_json,
    affiliate_url, affiliate_network, affiliate_tracking_label, affiliate_generated_at,
    affiliate_credential_ref, monetizable, publication_eligible,
    detected_at, first_seen_at, updated_at, revision
  )
  VALUES (
    p_row->>'id',
    p_row->>'identity_key',
    p_row->>'store',
    NULLIF(p_row->>'external_product_id', ''),
    p_row->>'identity_strategy',
    p_row->>'canonical_url',
    p_row->>'title',
    (p_row->>'current_price')::numeric,
    NULLIF(p_row->>'reference_price', '')::numeric,
    (p_row->>'discount_percent')::integer,
    p_row->>'currency',
    p_row->>'category',
    p_row->>'availability',
    p_row->>'status',
    NULLIF(p_row->>'seller_external_id', ''),
    NULLIF(p_row->>'seller_display_name', ''),
    p_row->>'seller_trust_class',
    NULLIF(p_row->>'seller_reputation_score', '')::numeric,
    (p_row->>'score_value')::integer,
    p_row->>'score_grade',
    p_row->>'score_version',
    COALESCE(p_row->'score_reasons', '[]'::jsonb),
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_row->'score_gates_failed', '[]'::jsonb))),
      '{}'::text[]
    ),
    p_row->>'evidence_source',
    (p_row->>'evidence_captured_at')::timestamptz,
    (p_row->>'evidence_current_price')::numeric,
    NULLIF(p_row->>'evidence_reference_price', '')::numeric,
    p_row->>'evidence_currency',
    p_row->>'evidence_quality',
    p_row->>'evidence_price_confidence',
    p_row->>'evidence_historical_confidence',
    NULLIF(p_row->>'evidence_observation_window_days', '')::integer,
    NULLIF(p_row->>'evidence_observation_count', '')::integer,
    COALESCE((p_row->>'evidence_coupon_applied')::boolean, false),
    COALESCE((p_row->>'evidence_promotion_applied')::boolean, false),
    NULLIF(p_row->>'evidence_notes', ''),
    p_row->'evidence_json',
    NULLIF(p_row->>'affiliate_url', ''),
    NULLIF(p_row->>'affiliate_network', ''),
    NULLIF(p_row->>'affiliate_tracking_label', ''),
    NULLIF(p_row->>'affiliate_generated_at', '')::timestamptz,
    NULLIF(p_row->>'affiliate_credential_ref', ''),
    COALESCE((p_row->>'monetizable')::boolean, false),
    COALESCE((p_row->>'publication_eligible')::boolean, false),
    (p_row->>'detected_at')::timestamptz,
    COALESCE((p_row->>'first_seen_at')::timestamptz, (p_row->>'detected_at')::timestamptz),
    COALESCE((p_row->>'updated_at')::timestamptz, now()),
    COALESCE((p_row->>'revision')::integer, 1)
  )
  ON CONFLICT (identity_key) DO UPDATE SET
    store = EXCLUDED.store,
    external_product_id = EXCLUDED.external_product_id,
    identity_strategy = EXCLUDED.identity_strategy,
    canonical_url = EXCLUDED.canonical_url,
    title = EXCLUDED.title,
    current_price = EXCLUDED.current_price,
    reference_price = EXCLUDED.reference_price,
    discount_percent = EXCLUDED.discount_percent,
    currency = EXCLUDED.currency,
    category = EXCLUDED.category,
    availability = EXCLUDED.availability,
    status = EXCLUDED.status,
    seller_external_id = EXCLUDED.seller_external_id,
    seller_display_name = EXCLUDED.seller_display_name,
    seller_trust_class = EXCLUDED.seller_trust_class,
    seller_reputation_score = EXCLUDED.seller_reputation_score,
    score_value = EXCLUDED.score_value,
    score_grade = EXCLUDED.score_grade,
    score_version = EXCLUDED.score_version,
    score_reasons = EXCLUDED.score_reasons,
    score_gates_failed = EXCLUDED.score_gates_failed,
    evidence_source = EXCLUDED.evidence_source,
    evidence_captured_at = EXCLUDED.evidence_captured_at,
    evidence_current_price = EXCLUDED.evidence_current_price,
    evidence_reference_price = EXCLUDED.evidence_reference_price,
    evidence_currency = EXCLUDED.evidence_currency,
    evidence_quality = EXCLUDED.evidence_quality,
    evidence_price_confidence = EXCLUDED.evidence_price_confidence,
    evidence_historical_confidence = EXCLUDED.evidence_historical_confidence,
    evidence_observation_window_days = EXCLUDED.evidence_observation_window_days,
    evidence_observation_count = EXCLUDED.evidence_observation_count,
    evidence_coupon_applied = EXCLUDED.evidence_coupon_applied,
    evidence_promotion_applied = EXCLUDED.evidence_promotion_applied,
    evidence_notes = EXCLUDED.evidence_notes,
    evidence_json = EXCLUDED.evidence_json,
    affiliate_url = EXCLUDED.affiliate_url,
    affiliate_network = EXCLUDED.affiliate_network,
    affiliate_tracking_label = EXCLUDED.affiliate_tracking_label,
    affiliate_generated_at = EXCLUDED.affiliate_generated_at,
    affiliate_credential_ref = EXCLUDED.affiliate_credential_ref,
    monetizable = EXCLUDED.monetizable,
    publication_eligible = EXCLUDED.publication_eligible,
    detected_at = EXCLUDED.detected_at,
    updated_at = EXCLUDED.updated_at
  RETURNING * INTO v_row;

  IF v_was_insert THEN
    v_action := 'created';
  ELSIF v_row.revision > COALESCE(v_existing_revision, 0) THEN
    v_action := 'updated';
  ELSE
    v_action := 'unchanged';
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caza_upsert_deal_candidate(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_upsert_deal_candidate(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) caza_publications
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_publications (
  publication_id text PRIMARY KEY,
  deal_id text NOT NULL,
  store text NOT NULL
    CHECK (store IN ('mercadolibre_mx', 'amazon_mx')),
  affiliate_network text NOT NULL
    CHECK (affiliate_network IN ('mercadolibre_affiliates', 'amazon_associates_mx')),
  tracking_label text NOT NULL,
  telegram_channel text NOT NULL,
  telegram_message_id text NULL,
  published_at timestamptz NULL,
  status text NOT NULL
    CHECK (status IN ('PREPARED', 'PUBLISHED', 'FAILED', 'RETRACTED')),
  affiliate_url text NULL,
  published_revision integer NULL
    CHECK (published_revision IS NULL OR published_revision >= 1),
  prepared_at timestamptz NOT NULL,
  metrics_clicks integer NULL CHECK (metrics_clicks IS NULL OR metrics_clicks >= 0),
  metrics_orders integer NULL CHECK (metrics_orders IS NULL OR metrics_orders >= 0),
  metrics_approved_orders integer NULL
    CHECK (metrics_approved_orders IS NULL OR metrics_approved_orders >= 0),
  metrics_estimated_commission_amount numeric(12, 2) NULL,
  metrics_estimated_commission_currency text NULL,
  metrics_approved_commission_amount numeric(12, 2) NULL,
  metrics_approved_commission_currency text NULL,
  metrics_last_synced_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caza_publications IS
  'CazaOfertasss FASE 1 — publication tracking. Idempotent on publication_id. No Telegram send.';
COMMENT ON COLUMN public.caza_publications.publication_id IS
  'Deterministic identity: dealId|network|channel|trackingLabel.';

CREATE INDEX IF NOT EXISTS caza_publications_deal_id_idx
  ON public.caza_publications (deal_id, prepared_at DESC);

CREATE INDEX IF NOT EXISTS caza_publications_status_idx
  ON public.caza_publications (status, prepared_at DESC);

-- Concurrent publisher: first writer wins; later writers get existing row.
CREATE OR REPLACE FUNCTION public.caza_insert_publication_idempotent(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_publications%ROWTYPE;
  v_inserted boolean := false;
BEGIN
  IF p_row IS NULL OR p_row->>'publication_id' IS NULL THEN
    RAISE EXCEPTION 'caza_insert_publication_idempotent: publication_id required';
  END IF;

  INSERT INTO public.caza_publications AS t (
    publication_id, deal_id, store, affiliate_network, tracking_label,
    telegram_channel, telegram_message_id, published_at, status,
    affiliate_url, published_revision, prepared_at,
    metrics_clicks, metrics_orders, metrics_approved_orders,
    metrics_estimated_commission_amount, metrics_estimated_commission_currency,
    metrics_approved_commission_amount, metrics_approved_commission_currency,
    metrics_last_synced_at
  )
  VALUES (
    p_row->>'publication_id',
    p_row->>'deal_id',
    p_row->>'store',
    p_row->>'affiliate_network',
    p_row->>'tracking_label',
    p_row->>'telegram_channel',
    NULLIF(p_row->>'telegram_message_id', ''),
    NULLIF(p_row->>'published_at', '')::timestamptz,
    p_row->>'status',
    NULLIF(p_row->>'affiliate_url', ''),
    NULLIF(p_row->>'published_revision', '')::integer,
    (p_row->>'prepared_at')::timestamptz,
    NULLIF(p_row->>'metrics_clicks', '')::integer,
    NULLIF(p_row->>'metrics_orders', '')::integer,
    NULLIF(p_row->>'metrics_approved_orders', '')::integer,
    NULLIF(p_row->>'metrics_estimated_commission_amount', '')::numeric,
    NULLIF(p_row->>'metrics_estimated_commission_currency', ''),
    NULLIF(p_row->>'metrics_approved_commission_amount', '')::numeric,
    NULLIF(p_row->>'metrics_approved_commission_currency', ''),
    NULLIF(p_row->>'metrics_last_synced_at', '')::timestamptz
  )
  ON CONFLICT (publication_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_inserted := true;
  ELSE
    SELECT * INTO v_row
    FROM public.caza_publications
    WHERE publication_id = p_row->>'publication_id';
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caza_insert_publication_idempotent(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_insert_publication_idempotent(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) caza_revenue_events (APPEND-ONLY)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_revenue_events (
  event_id text PRIMARY KEY,
  network text NOT NULL
    CHECK (network IN ('mercadolibre_affiliates', 'amazon_associates_mx')),
  external_reference text NOT NULL,
  deal_id text NULL,
  tracking_label text NOT NULL,
  -- Conceptual mapping (no commission calculation here):
  --   COMMISSION + PENDING   ≈ commission detected
  --   COMMISSION + CONFIRMED ≈ commission approved
  --   REVERSAL               ≈ commission reversed
  -- Future event types (paid / reconciliation) require an explicit migration.
  event_type text NOT NULL
    CHECK (event_type IN ('CLICK', 'ORDER', 'APPROVED_ORDER', 'COMMISSION', 'REVERSAL')),
  amount numeric(12, 2) NULL
    CHECK (amount IS NULL OR amount > 0),
  currency text NULL
    CHECK (currency IS NULL OR currency = 'MXN'),
  occurred_at timestamptz NOT NULL,
  status text NOT NULL
    CHECK (status IN ('PENDING', 'CONFIRMED', 'REVERSED', 'REJECTED')),
  reverses_event_id text NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caza_revenue_events_network_type_ref_uidx
    UNIQUE (network, event_type, external_reference)
);

COMMENT ON TABLE public.caza_revenue_events IS
  'CazaOfertasss FASE 1 — affiliate revenue ledger. APPEND-ONLY. Server-only. Not Aventa money path.';
COMMENT ON COLUMN public.caza_revenue_events.event_id IS
  'Idempotency key: network:eventType:externalReference.';

CREATE INDEX IF NOT EXISTS caza_revenue_events_deal_id_idx
  ON public.caza_revenue_events (deal_id, occurred_at DESC)
  WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS caza_revenue_events_tracking_label_idx
  ON public.caza_revenue_events (tracking_label, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.caza_revenue_events_forbid_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'caza_revenue_events is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_caza_revenue_events_no_update
  ON public.caza_revenue_events;
CREATE TRIGGER trg_caza_revenue_events_no_update
  BEFORE UPDATE ON public.caza_revenue_events
  FOR EACH ROW
  EXECUTE FUNCTION public.caza_revenue_events_forbid_mutation();

DROP TRIGGER IF EXISTS trg_caza_revenue_events_no_delete
  ON public.caza_revenue_events;
CREATE TRIGGER trg_caza_revenue_events_no_delete
  BEFORE DELETE ON public.caza_revenue_events
  FOR EACH ROW
  EXECUTE FUNCTION public.caza_revenue_events_forbid_mutation();

CREATE OR REPLACE FUNCTION public.caza_append_revenue_event(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_revenue_events%ROWTYPE;
  v_appended boolean := false;
BEGIN
  IF p_row IS NULL OR p_row->>'event_id' IS NULL THEN
    RAISE EXCEPTION 'caza_append_revenue_event: event_id required';
  END IF;

  INSERT INTO public.caza_revenue_events AS t (
    event_id, network, external_reference, deal_id, tracking_label,
    event_type, amount, currency, occurred_at, status, reverses_event_id, recorded_at
  )
  VALUES (
    p_row->>'event_id',
    p_row->>'network',
    p_row->>'external_reference',
    NULLIF(p_row->>'deal_id', ''),
    p_row->>'tracking_label',
    p_row->>'event_type',
    NULLIF(p_row->>'amount', '')::numeric,
    NULLIF(p_row->>'currency', ''),
    (p_row->>'occurred_at')::timestamptz,
    p_row->>'status',
    NULLIF(p_row->>'reverses_event_id', ''),
    COALESCE((p_row->>'recorded_at')::timestamptz, now())
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_appended := true;
  ELSE
    SELECT * INTO v_row
    FROM public.caza_revenue_events
    WHERE event_id = p_row->>'event_id';
  END IF;

  RETURN jsonb_build_object(
    'appended', v_appended,
    'duplicate', NOT v_appended,
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caza_append_revenue_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_append_revenue_event(jsonb) TO service_role;

-- Intentional failure helper for transaction-rollback contract tests (staging/dev).
CREATE OR REPLACE FUNCTION public.caza_upsert_deal_candidate_then_fail(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.caza_upsert_deal_candidate(p_row);
  RAISE EXCEPTION 'caza_forced_rollback';
END;
$$;

REVOKE ALL ON FUNCTION public.caza_upsert_deal_candidate_then_fail(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_upsert_deal_candidate_then_fail(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS + grants — server-only for all three tables
-- ---------------------------------------------------------------------------

ALTER TABLE public.caza_deal_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caza_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caza_revenue_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.caza_deal_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.caza_publications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.caza_revenue_events FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.caza_deal_candidates TO service_role;
GRANT ALL ON TABLE public.caza_publications TO service_role;
GRANT ALL ON TABLE public.caza_revenue_events TO service_role;

-- No policies for anon/authenticated → deny-by-default under RLS.
-- service_role bypasses RLS (server-only access path).
