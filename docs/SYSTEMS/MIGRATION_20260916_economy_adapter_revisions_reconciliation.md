# Migration — Adapter / Revisions / Reconciliation Foundation (PROD)

- File: `docs/supabase-migrations/20260916_economy_adapter_revisions_reconciliation.sql`
- Project: `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas)
- Applied via: `npx supabase db query --linked -f ...`
- Date (local): 2026-09-16
- Effect: additive tables
  - `affiliate_commission_revisions` (append-only amount history)
  - `affiliate_reconciliation_runs`
  - `affiliate_reconciliation_findings`
- Money path: untouched (no seed rows; ledger/rewards/payouts unchanged)
- Networks: **still NOT CONNECTED** (no public webhook)
- Note: first apply attempt failed on duplicate CHECK name; fixed to `affiliate_commission_revisions_amount_shape_check`; re-applied successfully
