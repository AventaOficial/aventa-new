# Attribution Foundation — production migration applied

- File: `docs/supabase-migrations/20260916_attribution_foundation_clicks.sql`
- Project: `mkgsrpsuvedwwlzmzmzh` (Aventa Cazadores de ofertas)
- Applied via: `supabase db query --linked -f ...`
- Date (local): 2026-09-16
- Effect: additive columns + partial UNIQUE idempotency on `reward_outbound_clicks`
- Money path: untouched (no ledger/rewards/payouts changes)
