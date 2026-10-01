# AVENTA — Day 2 Staging Canary

**Date:** 2026-09-24 / 2026-09-25 UTC  
**Branch:** `day2/staging-canary`  
**Staging ref:** `oojshofrpbfwsiypcecr`  
**Production ref:** `mkgsrpsuvedwwlzmzmzh` (read-only checks; no writes)

## Objective

Prove the real architecture path on staging:

Hunter candidate → extract → identity → Price Memory → Offer Standard → DQE → S6.1 → S7 → `ingestOfferObservation` → `offer_observations` + `pending`

Money / rewards / commissions / settlement / distribution / auto-publish / ranking / machine mint in production: **OFF**.

## Initial state

| Surface | Staging before | Production |
|---------|---------------:|-----------:|
| offers | 68 | 766 |
| pending | 0 | 0 |
| offer_observations | 0 | 0 |
| product_price_snapshots | 21 | 4911 |

### Price Memory (production, re-measured)

| Metric | Day 1 | Day 2 |
|--------|------:|------:|
| observations | 4911 | **4911** |
| unique products | 1636 | **1636** |
| distinct days | 36 | **36** |
| last_day | 2026-09-24 | **2026-09-24** |
| historyReady | 388 | **388** |
| notReady | 1248 | **1248** |
| one day from ready | 157 | **157** |
| anomalies / duplicates | 0 | **0** |

**Verdict:** Price Memory **stagnant since Day 1** (no new calendar day written after 2026-09-24). Still A+B: healthy history, insufficient sticky deepening overnight.

## How canary was enabled (staging only)

1. `.env.local` → `AVENTA_SUPABASE_TARGET=staging` + ref `oojshofrpbfwsiypcecr`
2. `BOT_INGEST_MACHINE_PENDING_WRITES` only inside `withMachinePendingWritesEnabled`
3. Seed staging PPS with **real prod census rows** for canary SKUs (`scripts/_day2_pm_seed.json`) — not fabricated prices
4. Candidate fixture `scripts/_day2_discovery.json` — primary SKU has real ≥12% savings vs habitual

Gates were **not** weakened. Smoke fixture cards fail correctly (`ARTIFICIAL_LIST_PRICE` / `DQE_POTENTIAL_ONLY`).

## Final staging evidence

| Metric | Value |
|--------|------:|
| candidates | 3 |
| extracted / identified | 3 / 3 |
| price_memory_ready (gate-visible) | 3 |
| offer_standard ranked | 3 |
| dqe_pass (VERIFIED) | 1 |
| s61_pass | 1 |
| s7_pass | 1 |
| pending_created | **1** |
| observations_created | **2** (S7 create + worker reuse evidence) |
| offers duplicated | **0** |
| sticky near-ready re-observe writes | 8 |

### Minted offer (staging)

- `id`: `b67f1537-d26b-4545-90b2-7da163a8899c`
- `status`: `pending`
- `product_fingerprint` / `ingestion_identity_key`: `ml:MLM2177969823`
- `created_by`: `d0903a8f-…` (dedicated S7 author)
- price `130.13` / original `175`

### Observations

| source | idempotency_key prefix | role |
|--------|------------------------|------|
| `day2_s7_canary` | `f0d46d24…` | create |
| `ml_worker` | `3c7506c8…` | append on reuse (same offer) |

## Idempotency

Second `writePendingViaS7Bridge` on same candidate:

- result: `duplicate` / `pending_fresh`
- offers delta: **0**
- observations delta: **0** (same idempotency key)
- flag after: **OFF**

## Sticky re-observation

`selectNearReadyStickyTargets` prioritizes `daysUntilReady` (does not lower `ML_PRICE_MIN_HISTORY_DAYS=4`).  
Staging run: poolNearReady=11, snapshots written=8 via idempotent daily upsert of last known price (no fabricated prices).

## Automation KPI

Module: `lib/bots/ingest/automationCycleMetrics.ts`

Cycle fields: `candidate_count`, `auto_processed`, `human_required`, `blocked`, `retryable`, `failed`, `pending_created`, `automation_rate`.

Day 2 live: S7 mint = auto_processed; worker retry = duplicate. Automation is measurable; not claimed as 95%.

## Commands

```bash
npx tsx --env-file=.env.local scripts/day2-staging-ingestion-canary.ts
npx tsx --env-file=.env.local scripts/day2-staging-ingestion-canary.ts --execute --cap=3
```

Report: `scripts/_day2_reports/day2-report-latest.json`

## Safety after canary

| Flag / surface | State |
|----------------|-------|
| staging writes flag after | OFF |
| production pending | 0 |
| production offer_observations | 0 |
| production PPS | unchanged 4911 |
| money / rewards / commissions / settlement / distribution | OFF |

## Files

- `scripts/day2-staging-ingestion-canary.ts`
- `scripts/_day2_discovery.json`
- `scripts/_day2_pm_seed.json`
- `lib/bots/ingest/automationCycleMetrics.ts`
- `lib/bots/ingest/day2StagingCanary.ts`
- `lib/hunter/supply/nearReadySticky.ts`
- `tests/bots/ingest/day2StagingCanary.test.ts`
- `docs/AVENTA_DAY2_CANARY.md` (this file)

## Blockers / honest limits

1. Public ML API returns 403 from this environment → live discovery fetch blocked; canary used census-backed candidates.
2. Only **one** prod SKU currently meets VERIFIED (historyReady + ≥12% vs habitual + non-artificial list) among scanned set — product quality scarcity, not a gate bypass.
3. Production Price Memory did not advance a new calendar day since Day 1 snapshot.

## Day 2 status

**DONE** for staging ingestion loop proof (observation + pending + S7 + sole writer + idempotency + sticky mechanism + automation KPI + prod safety).
