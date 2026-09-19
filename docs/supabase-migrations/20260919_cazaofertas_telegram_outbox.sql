-- CazaOfertasss FASE 2 — Telegram Publication Outbox
-- STAGING-FIRST. Do NOT apply to production without explicit approval.
-- Money-path Aventa untouched.
--
-- Extiende caza_publications con:
--   SENDING status, lease, attempts, errors, telegram_chat_id
-- RPCs atómicos:
--   caza_claim_publication
--   caza_save_claimed_publication
--   caza_recover_publication_leases
-- Actualiza caza_insert_publication_idempotent para columnas nuevas.

-- ---------------------------------------------------------------------------
-- 1) Columnas outbox
-- ---------------------------------------------------------------------------

ALTER TABLE public.caza_publications
  DROP CONSTRAINT IF EXISTS caza_publications_status_check;

ALTER TABLE public.caza_publications
  ADD CONSTRAINT caza_publications_status_check
  CHECK (status IN ('PREPARED', 'SENDING', 'PUBLISHED', 'FAILED', 'RETRACTED'));

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS telegram_chat_id text NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0);

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5
    CHECK (max_attempts >= 1 AND max_attempts <= 20);

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS leased_until timestamptz NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS lease_owner text NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS last_error_code text NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS last_error_message text NULL;

ALTER TABLE public.caza_publications
  ADD COLUMN IF NOT EXISTS card_snapshot jsonb NULL;

COMMENT ON COLUMN public.caza_publications.attempt_count IS
  'Send attempts including the active SENDING claim.';
COMMENT ON COLUMN public.caza_publications.leased_until IS
  'Lease expiry for SENDING. Crash recovery when expired without message_id.';
COMMENT ON COLUMN public.caza_publications.telegram_chat_id IS
  'Effective chat_id returned/used at send time.';
COMMENT ON COLUMN public.caza_publications.card_snapshot IS
  'Immutable Telegram card snapshot frozen at PREPARE. Never mutated after insert.';

CREATE INDEX IF NOT EXISTS caza_publications_due_idx
  ON public.caza_publications (status, next_attempt_at, prepared_at, publication_id)
  WHERE status = 'PREPARED';

CREATE INDEX IF NOT EXISTS caza_publications_sending_lease_idx
  ON public.caza_publications (status, leased_until)
  WHERE status = 'SENDING';

-- ---------------------------------------------------------------------------
-- 2) Insert idempotente (columnas nuevas)
-- ---------------------------------------------------------------------------

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
    telegram_channel, telegram_message_id, telegram_chat_id, published_at, status,
    affiliate_url, published_revision, prepared_at,
    attempt_count, max_attempts, next_attempt_at, leased_until, lease_owner,
    last_error_code, last_error_message, card_snapshot,
    metrics_clicks, metrics_orders, metrics_approved_orders,
    metrics_estimated_commission_amount, metrics_estimated_commission_currency,
    metrics_approved_commission_amount, metrics_approved_commission_currency,
    metrics_last_synced_at, updated_at
  )
  VALUES (
    p_row->>'publication_id',
    p_row->>'deal_id',
    p_row->>'store',
    p_row->>'affiliate_network',
    p_row->>'tracking_label',
    p_row->>'telegram_channel',
    NULLIF(p_row->>'telegram_message_id', ''),
    NULLIF(p_row->>'telegram_chat_id', ''),
    NULLIF(p_row->>'published_at', '')::timestamptz,
    COALESCE(NULLIF(p_row->>'status', ''), 'PREPARED'),
    NULLIF(p_row->>'affiliate_url', ''),
    NULLIF(p_row->>'published_revision', '')::integer,
    (p_row->>'prepared_at')::timestamptz,
    COALESCE(NULLIF(p_row->>'attempt_count', '')::integer, 0),
    COALESCE(NULLIF(p_row->>'max_attempts', '')::integer, 5),
    NULLIF(p_row->>'next_attempt_at', '')::timestamptz,
    NULLIF(p_row->>'leased_until', '')::timestamptz,
    NULLIF(p_row->>'lease_owner', ''),
    NULLIF(p_row->>'last_error_code', ''),
    NULLIF(p_row->>'last_error_message', ''),
    CASE
      WHEN p_row->'card_snapshot' IS NULL THEN NULL
      WHEN jsonb_typeof(p_row->'card_snapshot') = 'null' THEN NULL
      ELSE p_row->'card_snapshot'
    END,
    NULLIF(p_row->>'metrics_clicks', '')::integer,
    NULLIF(p_row->>'metrics_orders', '')::integer,
    NULLIF(p_row->>'metrics_approved_orders', '')::integer,
    NULLIF(p_row->>'metrics_estimated_commission_amount', '')::numeric,
    NULLIF(p_row->>'metrics_estimated_commission_currency', ''),
    NULLIF(p_row->>'metrics_approved_commission_amount', '')::numeric,
    NULLIF(p_row->>'metrics_approved_commission_currency', ''),
    NULLIF(p_row->>'metrics_last_synced_at', '')::timestamptz,
    COALESCE(NULLIF(p_row->>'updated_at', '')::timestamptz, now())
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

REVOKE ALL ON FUNCTION public.caza_insert_publication_idempotent(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_insert_publication_idempotent(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Claim atómico PREPARED|expired-SENDING → SENDING
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.caza_claim_publication(
  p_publication_id text,
  p_lease_owner text,
  p_lease_ms integer,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_publications%ROWTYPE;
BEGIN
  IF p_publication_id IS NULL OR length(trim(p_publication_id)) = 0 THEN
    RAISE EXCEPTION 'caza_claim_publication: publication_id required';
  END IF;
  IF p_lease_owner IS NULL OR length(trim(p_lease_owner)) < 4 THEN
    RAISE EXCEPTION 'caza_claim_publication: lease_owner required';
  END IF;
  IF p_lease_ms IS NULL OR p_lease_ms < 1000 OR p_lease_ms > 600000 THEN
    RAISE EXCEPTION 'caza_claim_publication: lease_ms out of range';
  END IF;

  SELECT * INTO v_row
  FROM public.caza_publications
  WHERE publication_id = p_publication_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_found', 'row', NULL);
  END IF;

  IF v_row.status = 'PUBLISHED' THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'already_published', 'row', to_jsonb(v_row));
  END IF;

  IF v_row.status IN ('FAILED', 'RETRACTED') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'reason', 'terminal:' || v_row.status,
      'row', to_jsonb(v_row)
    );
  END IF;

  IF v_row.status = 'SENDING'
     AND v_row.leased_until IS NOT NULL
     AND v_row.leased_until > p_now THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'lease_held', 'row', to_jsonb(v_row));
  END IF;

  IF v_row.status = 'PREPARED'
     AND v_row.next_attempt_at IS NOT NULL
     AND v_row.next_attempt_at > p_now THEN
    RETURN jsonb_build_object('claimed', false, 'reason', 'not_due', 'row', to_jsonb(v_row));
  END IF;

  IF v_row.attempt_count >= v_row.max_attempts THEN
    UPDATE public.caza_publications SET
      status = 'FAILED',
      last_error_code = 'publication.max_attempts',
      last_error_message = 'max attempts reached at claim',
      leased_until = NULL,
      lease_owner = NULL,
      updated_at = p_now
    WHERE publication_id = p_publication_id
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('claimed', false, 'reason', 'max_attempts', 'row', to_jsonb(v_row));
  END IF;

  UPDATE public.caza_publications SET
    status = 'SENDING',
    attempt_count = attempt_count + 1,
    lease_owner = p_lease_owner,
    leased_until = p_now + make_interval(secs => (p_lease_ms::numeric / 1000.0)),
    updated_at = p_now
  WHERE publication_id = p_publication_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('claimed', true, 'reason', 'claimed', 'row', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.caza_claim_publication(text, text, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_claim_publication(text, text, integer, timestamptz)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Save condicionado al lease_owner
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.caza_save_claimed_publication(
  p_row jsonb,
  p_lease_owner text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_publications%ROWTYPE;
  v_saved boolean := false;
BEGIN
  IF p_row IS NULL OR p_row->>'publication_id' IS NULL THEN
    RAISE EXCEPTION 'caza_save_claimed_publication: publication_id required';
  END IF;

  -- card_snapshot is intentionally NOT updated (immutable after insert).
  UPDATE public.caza_publications SET
    telegram_message_id = NULLIF(p_row->>'telegram_message_id', ''),
    telegram_chat_id = NULLIF(p_row->>'telegram_chat_id', ''),
    published_at = NULLIF(p_row->>'published_at', '')::timestamptz,
    status = p_row->>'status',
    affiliate_url = NULLIF(p_row->>'affiliate_url', ''),
    published_revision = NULLIF(p_row->>'published_revision', '')::integer,
    attempt_count = COALESCE(NULLIF(p_row->>'attempt_count', '')::integer, attempt_count),
    max_attempts = COALESCE(NULLIF(p_row->>'max_attempts', '')::integer, max_attempts),
    next_attempt_at = NULLIF(p_row->>'next_attempt_at', '')::timestamptz,
    leased_until = NULLIF(p_row->>'leased_until', '')::timestamptz,
    lease_owner = NULLIF(p_row->>'lease_owner', ''),
    last_error_code = NULLIF(p_row->>'last_error_code', ''),
    last_error_message = NULLIF(p_row->>'last_error_message', ''),
    updated_at = COALESCE(NULLIF(p_row->>'updated_at', '')::timestamptz, now())
  WHERE publication_id = p_row->>'publication_id'
    AND (lease_owner IS NULL OR lease_owner = p_lease_owner OR status <> 'SENDING')
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_saved := true;
  ELSE
    SELECT * INTO v_row
    FROM public.caza_publications
    WHERE publication_id = p_row->>'publication_id';
  END IF;

  RETURN jsonb_build_object('saved', v_saved, 'row', to_jsonb(v_row));
END;
$$;

REVOKE ALL ON FUNCTION public.caza_save_claimed_publication(jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_save_claimed_publication(jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Recover expired SENDING leases (bounded)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.caza_recover_publication_leases(
  p_now timestamptz DEFAULT now(),
  p_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_recovered integer := 0;
  v_batch integer := 0;
BEGIN
  v_limit := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));

  -- Unknown outcome → FAILED (no auto-retry; evita duplicados Telegram).
  WITH picked AS (
    SELECT publication_id
    FROM public.caza_publications
    WHERE status = 'SENDING'
      AND (leased_until IS NULL OR leased_until <= p_now)
      AND telegram_message_id IS NULL
      AND last_error_code IN ('telegram_network_or_timeout', 'telegram_missing_message_id')
    ORDER BY publication_id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.caza_publications t SET
    status = 'FAILED',
    leased_until = NULL,
    lease_owner = NULL,
    updated_at = p_now
  FROM picked
  WHERE t.publication_id = picked.publication_id;

  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_recovered := v_recovered + v_batch;

  -- Crash recovery: SENDING expirado sin message_id → PREPARED.
  WITH picked AS (
    SELECT publication_id
    FROM public.caza_publications
    WHERE status = 'SENDING'
      AND (leased_until IS NULL OR leased_until <= p_now)
      AND telegram_message_id IS NULL
      AND (
        last_error_code IS NULL
        OR last_error_code NOT IN ('telegram_network_or_timeout', 'telegram_missing_message_id')
      )
    ORDER BY publication_id
    LIMIT GREATEST(0, v_limit - v_recovered)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.caza_publications t SET
    status = 'PREPARED',
    leased_until = NULL,
    lease_owner = NULL,
    next_attempt_at = NULL,
    updated_at = p_now
  FROM picked
  WHERE t.publication_id = picked.publication_id;

  GET DIAGNOSTICS v_batch = ROW_COUNT;
  v_recovered := v_recovered + v_batch;

  RETURN jsonb_build_object('recovered', v_recovered);
END;
$$;

REVOKE ALL ON FUNCTION public.caza_recover_publication_leases(timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_recover_publication_leases(timestamptz, integer)
  TO service_role;

-- RLS remains: server-only (no anon/authenticated policies). Tables already revoked.
