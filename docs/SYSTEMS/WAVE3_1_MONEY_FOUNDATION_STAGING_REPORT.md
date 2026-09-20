# WAVE 3.1 — Money Foundation Staging Restoration Report

**Date:** 2026-09-19  
**Verdict:** **PASS**  
**Target:** staging `oojshofrpbfwsiypcecr` only  
**Production:** `mkgsrpsuvedwwlzmzmzh` — ZERO writes / ZERO migrations applied this wave  

---

## Answers (Phase I)

### 1. ¿Cuál es el schema canónico?

Money Foundation (Click → Conversion → Commission; settlement DDL ready, runtime OFF):

| Table | Role |
|-------|------|
| `reward_outbound_clicks` | Attribution SoT (already on staging) |
| `affiliate_ledger_entries` | Platform ledger (FK target; no writes this wave) |
| `affiliate_conversions` | Network conversion events |
| `affiliate_commissions` | Network commission amounts; `ledger_entry_id` NULL until settle |
| `affiliate_economic_events` | Append-only audit (`conversion` \| `commission` \| `settlement`) |

Canonical uniqueness:

- `(source, network, external_conversion_id)` on conversions  
- `(source, network, external_commission_id)` on commissions  
- `UNIQUE(conversion_id)` → one commission per conversion  
- `UNIQUE(ledger_entry_id) WHERE NOT NULL` → one ledger per commission  
- `UNIQUE(network, external_ref) WHERE set` on ledger  

### 2. ¿Qué migraciones lo crean?

Applied in order (existing files only — no invented DDL):

1. `docs/supabase-migrations/affiliate_platform_ledger.sql`  
2. `docs/supabase-migrations/20260916_conversion_commission_foundation.sql`  
3. `docs/supabase-migrations/20260918_money_system_double_credit.sql`  
4. `docs/supabase-migrations/20260918_money_settlement_bridge_m1.sql`  

**Not applied (intentional):**

- `commissions_attributed_revenue.sql` — full file ALTERs `commission_pools` (missing on staging); ledger attribution columns not required for Click→Commission  
- `20260830_rewards_v1.sql` — would create `creator_rewards` (Rewards OUT OF SCOPE)  
- reconciliation / revision tables (optional; not required for M1/M2 seam to Commission)  
- anything on production  

### 3. ¿Qué objetos faltaban en staging?

Before apply: `affiliate_ledger_entries`, `affiliate_conversions`, `affiliate_commissions`, `affiliate_economic_events`.  
Present: `reward_outbound_clicks`, `offers`.

### 4. ¿Qué se aplicó?

The four migrations above via:

`npx supabase db query --linked --project-ref oojshofrpbfwsiypcecr --experimental -f <file>`

Firewall: linked CLI defaults to production; **every** apply used `--project-ref oojshofrpbfwsiypcecr`.

### 5. ¿Qué NO se aplicó?

Rewards tables, payouts, pools, reconciliation, cron enablement, settlement runtime, production schema changes, second writers.

Flags after canaries:

- `MONEY_PATH_FROZEN=true`  
- `SETTLEMENT_BRIDGE_ENABLED=false`  
- `REWARDS_PROGRAM_ACTIVE=false`  
- `COMMISSION_PROGRAM_ACTIVE=false`  
- `DISTRIBUTION_ENGINE_ENABLED=false`  

### 6. ¿Hubo duplicados?

Phase B pre-apply: **PASS** (money tables empty / N/A; no click idempotency dups blocking UNIQUE).  
Artifact: `scripts/_wave3_reports/wave3-1-duplicate-check.json`

### 7. ¿Wave 3 llegó hasta Commission?

**Sí.** Full seam: S8→S9→S7→Mod→Dist→Click→Conversion→Commission.  
Artifact: `scripts/_wave3_reports/wave3-staging-e2e-latest.json` (`ok: true`)

| Seam | Code |
|------|------|
| S8→S9 | ELIGIBLE |
| S9→S7 | WRITE_OK |
| S7→Moderation | approved |
| Mod→Dist | ENQUEUED |
| Dist→Click | CLICK_RECORDED |
| Click→Conversion | CONVERSION_RECORDED / attributed |
| Conv→Commission | COMMISSION_RECORDED |

IDs (primary canary):

- offer: `2e67a22b-ca58-4f18-9390-7fa29d2b0ddc`  
- click: `b1ab0c11-959b-4c3d-90a8-459834fa7a9a`  
- conversion: `038406f8-42aa-4cc1-9d1d-527560a2b17b`  
- commission: `0e13735a-0f5e-4038-9c45-daaa7f6408ae`  

### 8. ¿Cuántas conversions se crearon?

Staging total after canaries: **2**

- 1 attributed (E2E primary)  
- 1 unattributed (`missing_click` adversarial case)  

Primary path: **1** conversion for the E2E click.

### 9. ¿Cuántas commissions?

Staging total: **1** (for the attributed conversion only).

### 10. ¿Hubo duplicate credit?

**No.** Adversarial canary (`wave3-1-money-seam-canary.ts --execute`):

- conversion replay → `reused=true`, 1 row  
- commission replay → `reused=true`, 1 row  
- concurrent commission ×2 → both reused same id, `rowsForConversion=1`  

### 11. ¿Hubo ledger writes?

**No.** `affiliate_ledger_entries` count = **0**; E2E delta = 0; settlement boundary ledgerDelta = 0.

### 12. ¿Hubo reward writes?

**No.** `creator_rewards` still absent / not written; rewardsDelta = 0.

### 13. ¿Settlement permaneció bloqueado?

**Sí.**

- Commission set to `approved` (recognizable by settle path)  
- `seamCommissionToSettlement` → `SETTLEMENT_DISABLED`  
- `settleCommission()` direct → `reason: settlement_disabled`  
- `ledger_entry_id` still NULL  
- Flags: settlement OFF + money frozen  

Artifact: `scripts/_wave3_reports/wave3-1-money-seam-canary-latest.json` → `cases.settlement_boundary.ok=true`

Settlement was **not** activated (no `--execute` settlement canary with bridge ON).

### 14. ¿Production permaneció intacta?

**Sí — zero writes from this wave.**  
Read-only check confirmed production already has money tables (pre-existing); no migrations were applied with production ref. CLI remains linked to production by default; all Wave 3.1 applies used staging `--project-ref`.

### 15. ¿Qué blockers quedan?

#### P1 — Dual machine write path (real boundary debt)

**Finding (validated, not patched):**

1. **`BOT_INGEST_AUTO_APPROVE` “ON” is nuanced, not a silent write switch**  
   - `autoApproveEnabled` defaults true (scoring / policy).  
   - **Write** of `status=approved` requires `legacyAutoApproveWriteEnabled` = explicit `BOT_INGEST_AUTO_APPROVE=1|true` **and** non-production runtime.  
   - Production write path for auto-approve is code-hard OFF.  

2. **`runIngestCycle` / `runIngestCycleForProfile` still call `insertIngestedOffer` without `BOT_INGEST_MACHINE_PENDING_WRITES` / `withMachinePendingWritesEnabled`.**  
   - Wired from `app/api/cron/bot-ingest`.  
   - S9 contract treats machine pending writes as gated; legacy cron is a **parallel writer authority**.  
   - `insertIngestedOffer` itself has **no** machine-writes gate.  

**Authority correct:** single write authority should be `insertIngestedOffer` **only** under an explicit machine/cron write gate (S9 `withMachinePendingWritesEnabled` or equivalent), with `runIngestCycle` either gated the same way or retired from cron.

**Proposed architectural fix (do not ship in 3.1):**

- Fail-closed: require machine-writes (or dedicated cron allowlist) inside `insertIngestedOffer` / shared gate.  
- Make `legacyAutoApproveWriteEnabled` default false everywhere; rename env so “AUTO_APPROVE” cannot be read as write permission.  
- Cron `bot-ingest` either delegates to S9 automation or shares the same kill switch.  

**Severity:** **P1** (boundary / dual-writer). Not P0 for money foundation (does not mint ledger/rewards). Blocks clean “sole machine writer” claim for later supply waves.

#### Deferred (not blockers for Commission)

- Ledger additive columns (`creator_id`, `click_id`, …) — needed only when settlement executes.  
- `commission_pools` / Rewards tables — out of scope.  

---

## Phase evidence map

| Phase | Result | Artifact |
|-------|--------|----------|
| A Audit | PASS | `docs/SYSTEMS/WAVE3_1_MONEY_SCHEMA_AUDIT.md` |
| B Duplicates | PASS | `scripts/_wave3_reports/wave3-1-duplicate-check.json` |
| C Apply | PASS (4 migrations staging) | CLI `--project-ref oojshofrpbfwsiypcecr` |
| D Verify | PASS | constraints + unique indexes + RLS ON |
| E Seam + adversarial | PASS | e2e + `wave3-1-money-seam-canary-latest.json` |
| F Settlement boundary | PASS (blocked) | same canary |
| G Debt | Documented P1 | this report |
| H Tests | PASS | vitest 366; `tsc --noEmit`; `npm run build` |

### Tests

```
npx vitest run tests/integration/wave3 tests/economy tests/attribution tests/distribution tests/supply/s9
→ 26 files, 366 tests passed

npx tsc --noEmit → exit 0
npm run build → success
```

---

## WAVE 3.1 = PASS

Money Foundation restored on staging from canonical migrations. Seam proven through **Commission** with 1:1 conversion/commission, no ledger/reward writes, settlement remain blocked. Residual **P1** dual-writer debt documented; not patched in this wave.
