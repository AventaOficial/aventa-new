# P0-D3.1 — SCHEMA DECISION

**Date:** 2026-09-17  
**Decision:** **A — Production schema is canonical; mirror onto staging**

---

## Evidence

1. Production `mkgsrpsuvedwwlzmzmzh` has `public.reward_outbound_clicks` with full column set matching:
   - `20260830_rewards_v1.sql` (base)
   - `20260916_attribution_foundation_clicks.sql` (additive)
2. Code `recordAttributedClick` inserts exactly those columns.
3. Staging `oojshofrpbfwsiypcecr`: table **absent**.
4. No alternate click SoT exists in code for Distribution hop.

## Decision A details

| Choice | Value |
|--------|-------|
| Table | `public.reward_outbound_clicks` |
| Columns | Exact prod set (14 columns) — **no invented fields** |
| FK | `offer_id → offers(id) ON DELETE CASCADE` only |
| RLS | ENABLE + 0 policies |
| Grants | REVOKE anon/authenticated/PUBLIC; GRANT service_role |
| Indexes | Same 5 secondary + PK as prod |
| NOT created | ledger, payouts, creator_rewards, profile reward cols, publication_id |

## Rejected

| Option | Why |
|--------|-----|
| B (spec-only, no prod) | Prod **does** exist — use it |
| C (STOP / invent) | Evidence sufficient |
| Parallel attribution table | Forbidden |
| Copy prod click rows | Forbidden (PII / data isolation) |

## Apply procedure

- File: `docs/supabase-migrations/STAGING_P0D3_1_REWARD_OUTBOUND_CLICK_20260917.sql`
- Runtime abort if legacy `public.ofertas` missing (staging marker; prod has no `ofertas`)
- Apply with **explicit** `--project-ref oojshofrpbfwsiypcecr` (never ambiguous linked-only against prod)

## Apply result (2026-09-17)

| Check | Result |
|-------|--------|
| Apply step | `p0d3_1_reward_outbound_clicks_staging_ok` |
| Staging columns | 14 — match prod |
| Staging indexes | 6 (PK + 5) — match prod |
| Staging RLS | enabled, 0 policies |
| Staging grants | `service_role` + `postgres` only (no anon/authenticated) |
| Production `reward_outbound_clicks` count | **11** (unchanged; SELECT-only probes) |
| Production DDL | **none** |

## Explicit non-goals

- No Production DDL
- No Distribution flag ON
- No money / settlement / Supply / WhatsApp
- No `recordAttributedClick` fork
