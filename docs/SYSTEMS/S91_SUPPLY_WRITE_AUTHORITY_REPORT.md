# S9.1 — Supply Write Authority Hardening Report

**Date:** 2026-09-19  
**Verdict:** **PASS**  
**Target:** staging `oojshofrpbfwsiypcecr`  
**Production:** `mkgsrpsuvedwwlzmzmzh` — untouched  

Money / Distribution / Attribution / Settlement / Rewards: **not modified**.

---

## Answers (Phase 10)

### 1. ¿Cuántos machine writers existían antes?

**Ungated machine mint paths: 2 orchestration → 1 insert function**

| Path | Gate | Could mint? |
|------|------|-------------|
| S9 → `writePendingViaS7Bridge` → `insertIngestedOffer` | `BOT_INGEST_MACHINE_PENDING_WRITES` | Yes when ON |
| `externalWorker` → `insertIngestedOffer` | Checked before call | Yes when ON |
| `runIngestCycle` → `insertIngestedOffer` | **None** | **Yes always** (P1) |
| Hunter Supply Engine → `runIngestCycleForProfile` | Via ungated ingest | **Yes** when `SUPPLY_ENGINE_WRITE=1` |

Wave 3.1 P1: **legacy cron was a second write authority**.

### 2. ¿Cuántos quedan después?

**Ungated machine mint paths: 0**

| Path | After S9.1 |
|------|------------|
| S9 → gate → bridge → `insertIngestedOffer` | Canonical |
| `externalWorker` → `insertIngestedOffer` | Same kill-switch; **also** blocked inside `insertIngestedOffer`; status always `pending` |
| `runIngestCycle` | **Discovery-only** — no `insertIngestedOffer` import/call |
| Supply Engine write mode | Runs discovery cycle only; `wroteOffers=false` |

Sole INSERT function for machine offers remains **`insertIngestedOffer`**.

### 3. ¿Cuál es la única autoridad?

```
S9 automation
  → withMachinePendingWritesEnabled
  → writePendingViaS7Bridge
  → insertIngestedOffer   (assertMachineOfferWriteAuthorized + pending-only)
  → offers.status = pending
```

S7 (`insertIngestedOffer`) remains the sole machine INSERT implementation.  
Defense-in-depth: no caller can mint without the machine-writes kill-switch (and production fail-closed).

### 4. ¿Qué pasó con bot-ingest?

- `app/api/cron/bot-ingest` still exists → calls `runIngestCycleForProfile`
- Cycle is now **`runMode: discovery_only`**
- Eligible candidates are skipped with `s91_discovery_only_use_s9_for_writes`
- **No offer rows** are minted from this cron
- Live mint requires S9 (or gated S6.7 worker with the same kill-switch)

### 5. ¿Puede un caller saltarse el machine gate?

**No** for `insertIngestedOffer`:

1. `assertMachineOfferWriteAuthorized()` requires `BOT_INGEST_MACHINE_PENDING_WRITES`
2. Production runtime → `PRODUCTION_BLOCKED`
3. Regression test fails if a new `lib/` / `app/` caller appears outside the allowlist

UGC (`app/api/offers`) is a separate **human** write path (not machine).

### 6. ¿Cómo se diferencia approval decision de write authorization?

| Layer | Symbol | Role |
|-------|--------|------|
| Decision | `autoApproveEnabled` / score `auto_approve` | Shadow / policy conclusion |
| Legacy flag | `legacyAutoApproveWriteEnabled` | **Deprecated** — no longer authorizes approved INSERT |
| Write auth | `assertMachineOfferWriteAuthorized` | Kill-switch + production firewall |
| Mint status | `resolveMachineInsertStatus` | **Always `pending`** |

`BOT_INGEST_AUTO_APPROVE=true` cannot mint `approved` offers.

### 7. ¿Qué tests demuestran el boundary?

`tests/supply/s9/writeAuthority.s91.test.ts` (11 tests):

1. Gate OFF → blocked  
2. Inside `withMachinePendingWritesEnabled` → allowed  
3. Production → fail-closed  
4. Auto-approve ≠ write status  
5. `runIngestCycle` has no insert call  
6. Caller allowlist regression  
7. S9 uses bridge + gate  
8. Economy / distribution / attribution do not call insert  
9. Direct insert without gate → error  

Plus updated shadow wiring contracts for discovery-only ingest.

Suite run: `tests/supply` + `s9` + `wave3` + `economy` + `attribution` + `distribution` → **426 passed**.

### 8. ¿Qué staging evidence existe?

`npx tsx scripts/s9-live-staging-canary.ts --cap=2 --execute`

| Metric | Δ |
|--------|---|
| offers | **+2** |
| pending | **+2** |
| distribution | 0 |
| clicks | 0 |
| conversions | 0 |
| commissions | 0 |
| ledger | 0 |
| rewards | 0 |

Retry same fingerprint → `DUPLICATE` / `pending_fresh` → no second row.  
Flags final: `BOT_INGEST_MACHINE_PENDING_WRITES=OFF`, `SUPPLY_AUTOMATION_ENABLED=OFF`.

### 9. ¿Production permaneció intacta?

**Yes.** No migrations, no production writes, no cron activation, Settlement/Rewards/Distribution OFF. Canary `productionUntouched: true`.

### 10. ¿Quedan blockers?

**Residual (non-blocking for S9.1):** `processExternalWorkerBatch` remains an alternate *orchestrator* that can mint when the **same** kill-switch is ON. It is not ungated and cannot skip `assertMachineOfferWriteAuthorized`. Future optional consolidation: route worker batches through S9 decisions only.

Unrelated pre-existing flake: `resolveBotInsertPublication` amazon `linkModOk` expectation (not in S9.1 scope / requested suites).

---

## Changes summary

| File | Change |
|------|--------|
| `lib/bots/ingest/machineWriteAuth.ts` | **New** — write authorization |
| `lib/bots/ingest/insertIngestedOffer.ts` | Defense-in-depth + pending-only |
| `lib/bots/ingest/runIngestCycle.ts` | Discovery-only (no insert) |
| `lib/bots/ingest/externalWorker.ts` | Always pending mint |
| `lib/bots/ingest/config.ts` | Clarify decision vs write |
| `lib/hunter/supply/engine.ts` | Stop treating ingest as writer |
| `app/api/cron/bot-ingest/route.ts` | Docs: discovery-only |
| `tests/supply/s9/writeAuthority.s91.test.ts` | **New** boundary suite |
| Shadow contract tests | Accept discovery-only ingest |

Audit: `docs/SYSTEMS/S91_SUPPLY_WRITE_AUTHORITY_AUDIT.md`

---

## Verification

```
npx vitest run tests/supply tests/supply/s9 tests/integration/wave3 tests/economy tests/attribution tests/distribution
→ 38 files, 426 tests passed

npx tsc --noEmit → exit 0
npm run build → success
```

---

## S9.1 = PASS

Dual-writer boundary from Wave 3.1 P1 is closed: legacy cron cannot mint; machine INSERT requires the kill-switch; approval decision ≠ write authorization; staging canary proves S9 sole live mint with money/distribution untouched.
