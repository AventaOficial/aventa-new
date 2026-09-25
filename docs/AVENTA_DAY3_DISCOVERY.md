# AVENTA — Day 3 Continuous Discovery

**Date:** 2026-09-24 (execution continued across session)  
**Branch:** `day3/continuous-discovery`  
**Base:** Day 2 `b2ce3f2`  
**Staging ref:** `oojshofrpbfwsiypcecr`  
**Rule:** staging writes only; production money/distribution OFF.

---

## OBJECTIVE

Convert Hunter into a continuous discovery machine:

`TRIGGER → DISCOVERY → CANDIDATES → ENRICH → DQE → S6.1 → S7 → sole writer → OBSERVATION`

without an operator pasting URLs.

---

## ARCHITECTURE

Single cycle authority: `runContinuousDiscoveryCycle`  
(`lib/hunter/discovery/continuousDiscoveryCycle.ts`)

```
GET /api/cron/bot-ingest?mode=continuous   (dry-run; CRON_SECRET)
        │
        ▼
runContinuousDiscoveryCycle
  ├─ runHunterCollect (HUNTER_SOURCES minus env_urls / ml_worker)
  ├─ collectStickyNearReadyCandidates (Price Memory near-ready)
  ├─ collectPmEvidenceBackedCandidates (PM ∩ evidence product_ids)
  ├─ canonicalize + dedupeHunterCandidates
  ├─ prioritizeAcquisitionPool (Offer Standard)
  ├─ enrich (observeStickySkuViaServer; evidence fallback if ML blocked)
  ├─ enrichWithPriceIntel (Price Memory)
  ├─ evaluateDealQualityFromParsedMeta (DQE)
  ├─ evaluateMachineCandidateGate (S6.1)
  └─ optional writePendingViaS7Bridge → insertIngestedOffer (sole writer)
```

No second Hunter. No second writer. No DQE/S6.1 bypass.

---

## SOURCES

| Source | Type | Staging status |
|--------|------|----------------|
| `ml_api_legacy` | official API search | skipped/disabled or BLOCKED (403) — isolated |
| `amazon_paapi` / `amazon_asin` | Amazon | skipped without credentials |
| Day-to-day retailers | unconfigured | skipped |
| `env_urls` | manual paste | **excluded** from continuous mode |
| `sticky_near_ready` | Price Memory near-ready | live (may be empty after cooldown) |
| `pm_evidence_backed` | PM product_ids ∩ census evidence | **success** (3 candidates) |

Source failure ≠ cycle failure. Per-source status: `success | blocked | retryable | failed | skipped | empty`.

---

## TRIGGER

1. **Authority:** `runContinuousDiscoveryCycle`
2. **Cron:** existing `/api/cron/bot-ingest?mode=continuous` (dry-run only)
3. **Staging execute:** `npx tsx --env-file=.env.local scripts/day3-continuous-discovery-cycle.ts --execute --cap=2 --idempotency`

---

## CYCLE ID

Each run allocates `cycle_id = randomUUID()`. Propagated to:

- funnel.cycle_id
- CycleFunnelSummary.runId / cycle_id
- S7 `ingestSourceDetail` (`continuous_discovery|cycle:…`)

---

## FUNNEL (real staging execute)

**cycle_id:** `6f74aa1a-ad25-4270-bb7d-6ac64d151388`

| Metric | Value |
|--------|------:|
| sources_requested | 8 |
| sources_succeeded | 1 (`pm_evidence_backed`) |
| sources_empty/skipped | 7 |
| candidates_discovered | 3 |
| candidates_canonicalized | 3 |
| fetch_blocked (ML) | 3 |
| extracted / identified | 3 / 3 |
| price_memory_ready | 3 |
| offer_standard_pass | 3 |
| dqe_verified / potential | 1 / 2 |
| s61_pass / blocked | 1 / 2 |
| pending_created (this run) | 0 (duplicate) |
| dry_run | false |

Cycle 2 (idempotency): same VERIFIED candidate → `duplicate: true` again. Δoffers=0, Δobs=0.

Report: `scripts/_day3_reports/day3-report-latest.json`

---

## PRICE MEMORY

### Production (re-measured via Supabase SQL, project `mkgsrpsuvedwwlzmzmzh`)

| Metric | Day 1/2 | Day 3 re-measure |
|--------|--------:|-----------------:|
| observations | 4911 | **4911** |
| unique products | 1636 | **1636** |
| calendar days | 36 | **36** |
| historyReady (≥4) | 388 | **388** |
| nearReady (=3) | 157 | **157** |
| notReady (<3) | 1091 | **1091** |
| last_day | 2026-09-24 | **2026-09-24** |

**Verdict:** Production Price Memory **still stagnant** — no new calendar day since Day 1 snapshot. Knowledge is not accumulating in prod overnight.

### Staging (after Day 3 PM seed + cycle)

| Metric | Value |
|--------|------:|
| observations | 97 |
| unique products | 29 |
| historyReady | 10 |
| nearReady | 9 |
| notReady | 10 |
| calendar days | 20 |

Staging is the canary write surface; not the long-horizon PM accumulation surface.

---

## IDEMPOTENCY

- Sole writer UNIQUE on product identity / ingestion keys.
- Second continuous cycle on VERIFIED SKU `MLM2177969823` → `duplicate` (already pending from Day 2).
- No double pending, no invented second observation row for the same mint attempt.

---

## FAILURE ISOLATION

- ML live fetch → `source_blocked` / `fetch_blocked=3`; cycle continued.
- Unconfigured retailers → `skipped`; cycle continued.
- DQE POTENTIAL candidates → S6.1 SUPPRESSED (`DQE_POTENTIAL_ONLY`); not forced to VERIFIED.

---

## AUTOMATION KPI

Uses existing `automationCycleMetrics`:

- automation = auto_processed / candidate_count (pending mint without human)
- This execute: 3 candidates → 2 blocked + 1 duplicate → `automation_rate=0` (honest; no new pending)

Dry-run never increments `pending_created` / `observations_created` as real writes (`buildCycleFunnelSummaryFromDiscovery`).

---

## STAGING DB (post Day 3)

| Metric | Count |
|-------:|------:|
| offers total | 69 |
| pending | 1 |
| offer_observations | 3 |

Pending identity already present from Day 2; Day 3 continuous path hit the same sole writer and stopped at duplicate.

---

## TESTS

- `tests/hunter/discovery/continuousDiscovery.test.ts` — contract, dedupe, isolation verdict, dry-run funnel honesty, automation_rate
- Prior Day 2 canary tests remain green

---

## FILES

- `lib/hunter/discovery/continuousDiscoveryCycle.ts`
- `lib/hunter/discovery/stickyNearReadySource.ts`
- `lib/hunter/discovery/censusSeedEnrichment.ts`
- `lib/hunter/discovery/index.ts`
- `lib/bots/ingest/cycleFunnelSummary.ts` (extended)
- `app/api/cron/bot-ingest/route.ts` (`?mode=continuous`)
- `scripts/day3-continuous-discovery-cycle.ts`
- `tests/hunter/discovery/continuousDiscovery.test.ts`
- `docs/AVENTA_DAY3_DISCOVERY.md`
- `docs/AVENTA_DAY1_GAP_REGISTER.md` (Day 3 updates)

---

## BLOCKERS

1. **Mercado Libre API 403** from this environment — classified BLOCKED/RETRYABLE; evidence-backed enrichment used only when product_id already in PM.
2. **Production Price Memory stagnant** (last_day still 2026-09-24) — continuous discovery in staging does not refill prod PM.
3. **Only one VERIFIED SKU** in evidence set already pending → Day 3 mint is idempotent duplicate (correct).

---

## DAY 3 STATUS

**DONE** — continuous discovery cycle runs without URL paste; multi-source isolation; cycle_id + funnel + automation; S6.1/DQE/S7 sole writer path exercised; idempotent duplicate on second pass; production remains write-safe / money OFF.
