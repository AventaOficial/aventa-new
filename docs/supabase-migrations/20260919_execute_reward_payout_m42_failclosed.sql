-- M4.2: execute_reward_payout deja de ser autoridad AVAILABLE→PAID.
-- Fail-closed wrapper. Históricos en reward_payouts no se tocan.
-- Aplicar SOLO staging. No backfill de payout_intents.

CREATE OR REPLACE FUNCTION public.execute_reward_payout(
  p_user_id uuid,
  p_amount_cents bigint,
  p_spei_reference text,
  p_created_by uuid,
  p_reward_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- M4.2: claim authority = payout_intents (app path). This RPC must not bypass.
  RAISE EXCEPTION 'legacy_rpc_disabled_use_payout_intent'
    USING ERRCODE = 'P0001',
          HINT = 'Use createManualRewardPayout → payout_intents. Historical reward_payouts rows remain evidence only.';
END;
$$;

REVOKE ALL ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) FROM anon;
REVOKE ALL ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) TO service_role;

COMMENT ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) IS
  'M4.2 fail-closed: no longer marks creator_rewards PAID. Use payout_intents claim authority.';
