# Migration — Conversion + Commission Foundation (PROD)

- File: `docs/supabase-migrations/20260916_conversion_commission_foundation.sql`
- Project: `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas)
- Applied via: `npx supabase db query --linked -f ...`
- Date (local): 2026-09-16
- Effect: additive tables `affiliate_conversions`, `affiliate_commissions`, `affiliate_economic_events` + UNIQUE external IDs + RLS service_role-only
- Money path: untouched (no ledger/rewards/payouts mutations; no seed rows)
- Post-apply counts: conversions=0, commissions=0, economic_events=0; ledger/rewards/payouts unchanged vs precheck
- Ingest: **not connected** (no affiliate network webhook)
