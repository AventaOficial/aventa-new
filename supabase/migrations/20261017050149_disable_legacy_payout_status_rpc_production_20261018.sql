-- Production-only guard: the legacy payout status RPC targets public.payouts,
-- which does not exist in production. No SQL dependents or function callers were found.
-- The canonical payout-intent flow remains separately gated; do not alter MONEY_PATH_FROZEN.
REVOKE ALL ON FUNCTION public.admin_mark_payout_status(bigint,text,timestamptz,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.admin_mark_payout_status(bigint,text,timestamptz,text,text,text) IS
  'DISABLED IN PRODUCTION: legacy RPC targets missing public.payouts. Do not grant execution; use the canonical payout-intent flow only after its separate money GO gate.';
