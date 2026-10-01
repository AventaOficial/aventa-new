-- Read-only delivery list for settlement reversal recovery.
-- Does not change economic rows, rewards, or payouts.
-- A completed audit is excluded, so a long completed history cannot hide an older gap.

CREATE INDEX IF NOT EXISTS affiliate_commissions_reversed_recovery_idx
  ON public.affiliate_commissions (updated_at ASC, id ASC)
  WHERE status = 'reversed' AND ledger_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.list_pending_settlement_reversal_commissions(p_limit integer)
RETURNS TABLE (
  id uuid,
  network text,
  ledger_entry_id uuid,
  updated_at timestamptz,
  pending_count bigint
)
LANGUAGE sql
STABLE
AS $$
  WITH pending AS (
    SELECT c.id, c.network, c.ledger_entry_id, c.updated_at
    FROM public.affiliate_commissions c
    WHERE c.status = 'reversed'
      AND c.ledger_entry_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.affiliate_economic_events e
        WHERE e.entity_type = 'settlement'
          AND e.entity_id = c.id
          AND e.event_type IN (
            'settlement_reversed',
            'settlement_reversal_reused',
            'settlement_reversal_inconsistent'
          )
      )
  )
  SELECT
    pending.id,
    pending.network,
    pending.ledger_entry_id,
    pending.updated_at,
    count(*) OVER () AS pending_count
  FROM pending
  ORDER BY updated_at ASC, pending.id ASC
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 25);
$$;

REVOKE ALL ON FUNCTION public.list_pending_settlement_reversal_commissions(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_pending_settlement_reversal_commissions(integer) TO service_role;
