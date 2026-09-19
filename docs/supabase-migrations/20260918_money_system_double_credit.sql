-- Money System Foundation — double-credit protection (ADITIVO).
-- One conversion → at most one affiliate_commissions row.
-- Revisions live in affiliate_commission_revisions (not extra commission rows).
-- Does NOT enable settlement, ledger writes, rewards, or payouts.

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_commissions_conversion_unique
  ON public.affiliate_commissions (conversion_id);

COMMENT ON INDEX public.affiliate_commissions_conversion_unique IS
  'Double-credit guard: same conversion cannot mint two commission rows.';
