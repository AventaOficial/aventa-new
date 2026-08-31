-- Restrict execute_reward_payout to service_role only (defense in depth).
REVOKE ALL ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_reward_payout(uuid, bigint, text, uuid, uuid[], text) TO service_role;
