-- Reward creation and its mandatory audits are one transaction.
-- If either audit insert does not land, the function raises and PostgreSQL
-- rolls back the creator_rewards row. There is no reward_created audit
-- without a reward, and no reward without both creation audits.
--
-- This file is the migration. Do not apply it by hand outside the migration flow.
-- Callers fail closed when the function is absent.

CREATE OR REPLACE FUNCTION public.create_creator_reward_with_creation_audit(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
  v_actor uuid;
  v_written integer;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'reward_creation_audit_failed';
  END IF;

  v_id := (p_payload->>'id')::uuid;
  v_actor := NULLIF(p_payload->>'actor_id', '')::uuid;

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
    NULLIF(p_payload->>'offer_id', '')::uuid,
    (p_payload->>'ledger_entry_id')::uuid,
    p_payload->>'network',
    (p_payload->>'gross_commission_cents')::bigint,
    (p_payload->>'creator_share_cents')::bigint,
    (p_payload->>'platform_share_cents')::bigint,
    (p_payload->>'creator_share_bps')::integer,
    COALESCE(NULLIF(p_payload->>'currency', ''), 'MXN'),
    p_payload->>'attribution_method',
    p_payload->>'attribution_confidence',
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
  'Inserts a VALIDATING creator reward and the mandatory reward_created plus reward_validating audits in one transaction.';
