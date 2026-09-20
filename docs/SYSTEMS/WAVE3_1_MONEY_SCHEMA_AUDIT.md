# WAVE 3.1 — Money Schema Audit (Phase A)

**Date:** 2026-09-19  
**Target:** staging `oojshofrpbfwsiypcecr` only  
**Production:** `mkgsrpsuvedwwlzmzmzh` — ZERO writes  
**CLI note:** `npx supabase projects list` shows **linked=production**. All applies MUST use `--project-ref oojshofrpbfwsiypcecr` (never bare `--linked`).

## 1–10. Canonical schema (code + migrations)

### Dependency graph (apply order)

```
offers (exists)
  ↓
reward_outbound_clicks          ← EXISTS on staging (headCount=6)
  ↓
affiliate_ledger_entries        ← MISSING (required FK for commissions.ledger_entry_id)
  ↓
affiliate_conversions           ← MISSING (FK → clicks, offers)
  ↓
affiliate_commissions           ← MISSING (FK → conversions, ledger)
  ↓
affiliate_economic_events       ← MISSING (audit append-only)
  ↓
affiliate_commissions_conversion_unique (20260918_money_system_double_credit.sql)
  ↓
affiliate_economic_events entity_type includes settlement
+ affiliate_commissions_ledger_entry_unique (20260918_money_settlement_bridge_m1.sql)
```

Optional (not required for Click→Commission seam; defer unless settle path demands):
- `affiliate_commission_revisions`
- `affiliate_reconciliation_*`
- `creator_rewards` / `ledger_settlements` — **OUT OF SCOPE** (Rewards OFF)

### Migration sources (canonical — reuse, do not invent)

| Order | File | Objects |
|------:|------|---------|
| 0 | `STAGING_P0D3_1_REWARD_OUTBOUND_CLICK_20260917.sql` / `20260830_rewards_v1.sql` + `20260916_attribution_foundation_clicks.sql` | `reward_outbound_clicks` + attribution columns — **already on staging** |
| 1 | `affiliate_platform_ledger.sql` | `affiliate_ledger_entries` base + UNIQUE(network, external_ref) + RLS |
| 1b | `commissions_attributed_revenue.sql` *(ledger columns only)* | Additive: `creator_id`, `tracking_tag`, `offer_id`, `attributable` — **skip pool ALTERs if `commission_pools` missing** |
| 1c | `20260830_rewards_v1.sql` *(ledger attribution columns only)* | Additive: `click_id`, `attribution_method`, `attribution_confidence` + FK to clicks — needed by settleCommission meta |
| 2 | `20260916_conversion_commission_foundation.sql` | `affiliate_conversions`, `affiliate_commissions`, `affiliate_economic_events` + indexes + RLS service_role |
| 3 | `20260918_money_system_double_credit.sql` | UNIQUE index `affiliate_commissions_conversion_unique` |
| 4 | `20260918_money_settlement_bridge_m1.sql` | economic_events entity_type + `settlement`; UNIQUE partial `affiliate_commissions_ledger_entry_unique` |

### Columns / constraints (summary)

**affiliate_conversions:** id, source∈{manual,csv_import,webhook,api}, network∈…, external_conversion_id, click_id→reward_outbound_clicks, offer_id→offers, attribution_status, status, occurred_at, order_amount_cents, currency, raw_reference, attribution_meta, timestamps; UNIQUE(source,network,external_conversion_id)

**affiliate_commissions:** id, conversion_id→conversions RESTRICT, source, network, external_commission_id, gross_commission_cents≥0, currency, status, occurred_at, ledger_entry_id→ledger NULL, raw_reference, timestamps; UNIQUE(source,network,external_commission_id); later UNIQUE(conversion_id); later UNIQUE(ledger_entry_id) WHERE NOT NULL

**affiliate_ledger_entries:** id, network, amount_cents, currency, period_*, status, external_ref, notes, source, meta, timestamps; UNIQUE(network, external_ref) WHERE external_ref set; RLS enabled

**affiliate_economic_events:** append-only audit; entity_type∈{conversion,commission,settlement} after M1

**RLS:** conversions/commissions/events/ledger — ENABLE RLS; GRANT service_role only; REVOKE anon/authenticated (no broad INSERT policies)

## 11–13. Staging vs canonical (probe 2026-09-19)

| Object | Staging |
|--------|---------|
| reward_outbound_clicks | **EXISTS** (count=6) |
| affiliate_ledger_entries | **MISSING** |
| affiliate_conversions | **MISSING** |
| affiliate_commissions | **MISSING** |
| affiliate_economic_events | **MISSING** |
| affiliate_commission_revisions | MISSING (optional) |
| creator_rewards | MISSING (out of scope) |
| ledger_settlements | MISSING (out of scope) |

Probe artifact: `scripts/_wave3_reports/wave3-1-schema-probe.json`

## Apply plan (Phase C — after Phase B)

1. Firewall: `--project-ref oojshofrpbfwsiypcecr` only  
2. Apply ledger base (+ additive attribution columns that do not require `commission_pools`)  
3. Apply conversion/commission foundation  
4. Apply double-credit unique  
5. Apply M1 settlement bridge DDL (constraints only — does not enable bridge)  
6. Verify via probe + information_schema if available  

**NOT applied in Wave 3.1:** creator_rewards, payouts, pool tables, reconciliation (unless dependency forces), production anything.

## Phase A verdict

Canonical schema is **unequivocal** from existing migrations. Proceed to Phase B (duplicate check — empty tables expected) then Phase C apply.

## Post-apply (Phase C–D) — 2026-09-19

Applied to staging `oojshofrpbfwsiypcecr` only (order 1→4 above, without 1b/1c).

Verified present: conversions, commissions, ledger, economic_events, clicks.  
Verified UNIQUE: `affiliate_commissions_conversion_unique`, `affiliate_commissions_ledger_entry_unique`, external uniques, ledger external_ref.  
RLS enabled on all money tables. `creator_rewards` / `ledger_settlements` still absent (correct).

Full outcome: `docs/SYSTEMS/WAVE3_1_MONEY_FOUNDATION_STAGING_REPORT.md`
