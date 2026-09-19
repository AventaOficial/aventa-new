-- M1 Money Settlement Bridge (ADITIVO, staging-documented).
-- Does NOT enable SETTLEMENT_BRIDGE_ENABLED.
-- Does NOT write production. Does NOT activate rewards/payouts.
-- Preserves affiliate_commissions_conversion_unique (double-credit).
--
-- Idempotency pillars:
-- 1) affiliate_ledger_entries UNIQUE (network, external_ref) — already exists
-- 2) affiliate_commissions.ledger_entry_id link (CAS in app)
-- 3) UNIQUE ledger_entry_id on commissions when set (one ledger → one commission)

-- Audit entity_type: allow settlement events (append-only).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'affiliate_economic_events_entity_type_check'
  ) THEN
    ALTER TABLE public.affiliate_economic_events
      DROP CONSTRAINT affiliate_economic_events_entity_type_check;
  END IF;
END $$;

ALTER TABLE public.affiliate_economic_events
  ADD CONSTRAINT affiliate_economic_events_entity_type_check
  CHECK (entity_type IN ('conversion', 'commission', 'settlement'));

COMMENT ON CONSTRAINT affiliate_economic_events_entity_type_check
  ON public.affiliate_economic_events IS
  'M1: settlement audit events; no PII/secrets.';

-- One ledger entry cannot be claimed by two commissions.
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_ledger_entry_unique
  ON public.affiliate_commissions (ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

COMMENT ON INDEX public.affiliate_commissions_ledger_entry_unique IS
  'M1 settlement: one ledger_entry_id → at most one commission.';

-- Explicit: do NOT flip settlement on. Runtime gate is SETTLEMENT_BRIDGE_ENABLED (default OFF).
