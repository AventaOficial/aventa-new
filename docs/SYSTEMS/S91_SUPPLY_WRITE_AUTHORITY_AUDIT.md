# S9.1 — Supply Write Authority Audit (Phase 1)

**Date:** 2026-09-19  
**Scope:** Eliminate dual machine-write authority for Supply. Staging-only changes.  
**Money / Distribution / Attribution / Settlement / Rewards:** out of scope (untouched).

## Canonical authority (target)

```
S9 automation
  → withMachinePendingWritesEnabled  (BOT_INGEST_MACHINE_PENDING_WRITES scoped)
  → writePendingViaS7Bridge
  → insertIngestedOffer               (sole machine INSERT into offers)
  → offers.status = pending
```

Human UGC / admin moderation are **not** machine writers.

---

## Callers of `insertIngestedOffer`

| Caller | Class | Before S9.1 | After S9.1 |
|--------|-------|-------------|------------|
| `lib/supply/s7Bridge/writePendingViaS7Bridge.ts` | **B machine** | Canonical S9→S7 | **Canonical** (unchanged role) |
| `lib/bots/ingest/externalWorker.ts` (`processExternalWorkerBatch`) | **B machine** | Writes if `isMachinePendingWriteEnabled()` | Same kill-switch; must pass in-function gate; **pending only** |
| `lib/bots/ingest/runIngestCycle.ts` | **C cron / B machine** | **Writes WITHOUT machine gate** (P1) | **Discovery-only — no insert** |
| `scripts/s67-*`, `s68-*`, `s72-*` | **D harness** | Via externalWorker + `withMachinePendingWritesEnabled` | Unchanged pattern |
| `scripts/wave3-staging-e2e.ts`, `s9-live-staging-canary.ts` | **D harness** | Via S9 / bridge + gate | Unchanged |
| `tests/bots/ingest/*` | **D test** | Mocks or gated | Updated for gate / pending-only |
| `app/api/offers/route.ts` | **A user/manual** | Direct `offers.insert` (not `insertIngestedOffer`) | Untouched |
| Staging soak / rewards QA scripts | **D / E** | Direct `offers.insert` | Untouched (not machine path) |

## Callers of `runIngestCycle` / `runIngestCycleForProfile`

| Caller | Class | Notes |
|--------|-------|-------|
| `app/api/cron/bot-ingest/route.ts` | **C cron** | Must become discovery-only (no offer insert) |
| `app/api/admin/bot-ingest-run-now/route.ts` | **A/C admin** | Same cycle → discovery-only |
| `lib/hunter/supply/engine.ts` | **B/C** | Called ingest for writes when `SUPPLY_ENGINE_WRITE=1` → **must stop** using ingest as writer |
| `lib/bots/ingest/index.ts` | re-export | — |
| Tests / shadow wiring contracts | **D** | Assert observe order / no direct decideAutonomous |

## Callers of `withMachinePendingWritesEnabled`

| Caller | Class |
|--------|-------|
| `lib/supply/automation/runSupplyAutomation.ts` | **B** S9 execute |
| `scripts/wave3-staging-e2e.ts` | **D** |
| `scripts/s9-live-staging-canary.ts` (indirect via S9) | **D** |
| `scripts/s67-*`, `s68-*`, `s72-*` | **D** |
| `tests/bots/ingest/machineInsertCanary.s67.test.ts` | **D** |
| `tests/integration/wave3/*` | **D** |

## Other `offers` INSERT paths (not `insertIngestedOffer`)

| Path | Class |
|------|-------|
| `app/api/offers/route.ts` | **A** authenticated UGC |
| Admin moderate / update routes | **A** status transitions (not machine pending mint) |
| Staging/test scripts inserting offers | **D/E** |

## Dual-writer problem (Wave 3.1 P1)

Before S9.1:

1. **S9** → gate → S7 ✅  
2. **externalWorker** → gate → S7 ✅ (same kill-switch)  
3. **runIngestCycle** → **S7 without gate** ❌ second authority  

Hunter Supply Engine amplified (3) when `SUPPLY_ENGINE_WRITE=1`.

## Auto-approve nuance

| Symbol | Role |
|--------|------|
| `autoApproveEnabled` | **Decision** scoring policy (default ON) — not write permission |
| `legacyAutoApproveWriteEnabled` | **Write** approved status — requires explicit env `=1|true` and non-production |
| S9.1 hardening | `insertIngestedOffer` **never persists `approved`**; machine mint = `pending` only |

## Apply plan (Phases 2–5)

1. Defense-in-depth inside `insertIngestedOffer`: require machine-writes ON; production fail-closed; force `pending`.  
2. Strip inserts from `runIngestCycleForProfile` → discovery-only.  
3. Stop Supply Engine from treating ingest cycle as writer.  
4. Keep cron routes; they run discovery/eval only; live mint only via S9.  
5. Regression test: forbid new direct production callers of `insertIngestedOffer` outside allowlist.

## Phase 1 verdict

Ambiguity is **unequivocal**: ungated `runIngestCycle` is the dual-writer. Proceed to close it without inventing a second insert function.
