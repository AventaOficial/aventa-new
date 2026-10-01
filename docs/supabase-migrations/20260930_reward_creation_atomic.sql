-- Atomic creator reward + mandatory creation audits.
-- One function, one transaction. A failed audit raises and rolls the reward back.
-- Idempotent: CREATE OR REPLACE. No data changes, no backfill, no historical PAID rewrite.
--
-- MONEY_PATH_FROZEN is a process environment variable. Postgres cannot read it.
-- This function does not accept a payload key that claims the freeze was bypassed.
-- The application writers return before calling it while the freeze is on.
-- anon and authenticated cannot execute it.
--
-- Not SECURITY DEFINER: it runs as the caller. Only service_role is granted.

CREATE OR REPLACE FUNCTION public.create_creator_reward_with_creation_audit(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id uuid;
  v_actor uuid;
  v_ledger_id uuid;
  v_gross bigint;
  v_creator bigint;
  v_platform bigint;
  v_written integer;
  v_ledger_status text;
  v_ledger_amount bigint;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  IF p_payload ? 'bypass_freeze' OR p_payload ? 'force' THEN
    RAISE EXCEPTION 'money_path_frozen'
      USING ERRCODE = 'P0001';
  END IF;

  IF NULLIF(p_payload->>'id', '') IS NULL
     OR NULLIF(p_payload->>'creator_id', '') IS NULL
     OR NULLIF(p_payload->>'ledger_entry_id', '') IS NULL
     OR NULLIF(p_payload->>'offer_id', '') IS NULL THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  v_id := (p_payload->>'id')::uuid;
  v_actor := NULLIF(p_payload->>'actor_id', '')::uuid;
  v_ledger_id := (p_payload->>'ledger_entry_id')::uuid;
  v_gross := (p_payload->>'gross_commission_cents')::bigint;
  v_creator := (p_payload->>'creator_share_cents')::bigint;
  v_platform := (p_payload->>'platform_share_cents')::bigint;

  IF v_gross IS NULL OR v_gross <= 0
     OR v_creator IS NULL OR v_creator <= 0
     OR v_platform IS NULL OR v_platform < 0
     OR v_creator + v_platform <> v_gross THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  IF COALESCE(NULLIF(p_payload->>'currency', ''), 'MXN') <> 'MXN' THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  IF p_payload->>'attribution_confidence' IS DISTINCT FROM 'high' THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  IF p_payload->>'attribution_method' NOT IN ('sub_id', 'product_click_window', 'manual') THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  IF COALESCE(p_payload->'fraud_flags', '[]'::jsonb) ?| ARRAY['self_click', 'anonymous_click'] THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  SELECT status, amount_cents
    INTO v_ledger_status, v_ledger_amount
  FROM public.affiliate_ledger_entries
  WHERE id = v_ledger_id;

  IF NOT FOUND
     OR v_ledger_status IN ('void', 'reversed')
     OR v_ledger_amount IS DISTINCT FROM v_gross THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  INSERT INTO public.creator_rewards (
    id,
    creator_id,
    offer_id,
    ledger_entry_id,
    network,
    gross_commission_cents,
    creator_share_cents,
    platform_share_cents,
    creator_share_bps,
    currency,
    attribution_method,
    attribution_confidence,
    status,
    hold_until,
    fraud_flags,
    meta
  ) VALUES (
    v_id,
    (p_payload->>'creator_id')::uuid,
    (p_payload->>'offer_id')::uuid,
    v_ledger_id,
    p_payload->>'network',
    v_gross,
    v_creator,
    v_platform,
    (p_payload->>'creator_share_bps')::integer,
    'MXN',
    p_payload->>'attribution_method',
    'high',
    'VALIDATING',
    (p_payload->>'hold_until')::timestamptz,
    COALESCE(p_payload->'fraud_flags', '[]'::jsonb),
    COALESCE(p_payload->'meta', '{}'::jsonb)
  );

  INSERT INTO public.reward_audit_log (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    'reward_created',
    v_actor,
    'creator_reward',
    v_id,
    NULL,
    'VALIDATING',
    COALESCE(p_payload->'audit_metadata', '{}'::jsonb)
  );
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> 1 THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  INSERT INTO public.reward_audit_log (
    event_type,
    actor_id,
    entity_type,
    entity_id,
    previous_state,
    new_state,
    metadata
  ) VALUES (
    'reward_validating',
    NULL,
    'creator_reward',
    v_id,
    'PENDING',
    'VALIDATING',
    jsonb_build_object(
      'hold_until', p_payload->>'hold_until',
      'created_at', p_payload->>'created_at',
      'ledger_entry_id', p_payload->>'ledger_entry_id'
    )
  );
  GET DIAGNOSTICS v_written = ROW_COUNT;
  IF v_written <> 1 THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_creator_reward_with_creation_audit(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_creator_reward_with_creation_audit(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.create_creator_reward_with_creation_audit(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_creator_reward_with_creation_audit(jsonb) TO service_role;

COMMENT ON FUNCTION public.create_creator_reward_with_creation_audit(jsonb) IS
  'Inserts one VALIDATING creator reward and the mandatory reward_created and reward_validating audits in a single transaction. Rejects void ledgers, non-positive amounts, self_click, anonymous_click, and any payload that claims to bypass the money-path freeze. Does not read MONEY_PATH_FROZEN; application writers must refuse before calling it.';
