# AVENTA — Day 5 Supply + Price Memory Freshness

**Date:** 2026-09-24  
**Branch:** `day5/supply-pm-freshness`  
**Base:** Day 4 `134cb94`

---

## ROOT CAUSE

Production forensic (SQL on `mkgsrpsuvedwwlzmzmzh`):

| MX day | ml_api_legacy runs | ml_api discovered | ml_worker runs | PM tip rows |
|--------|-------------------:|------------------:|---------------:|------------:|
| Sep 16–21 | ~97–112 | ~6500–7400 | ~6–11 | 263–406 |
| Sep 22 | 5 | 260 | 7 | 240 |
| Sep 23 | 2 | 70 | 6 | 189 |
| Sep 24 | 1 | 28 | 7 | 163 |

**Primary:** `ml_api_legacy` **invocation cadence collapsed** (~100 productive runs/day → 1). That path was the dominant writer of `product_price_snapshots` via `discoverMercadoLibre` → `recordMlDailySnapshots`.

**Secondary (architectural gap):** `ml_worker` stayed healthy (~36 candidates every few hours via GHA) but **`processExternalWorkerBatch` never called `recordMlDailySnapshots`**. Worker supply ≠ Price Memory.

**OAuth:** `ML_OAUTH_TOKEN_READ_FAILED` is real (token table read/RLS) but **secondary**. `getValidAccessToken` previously could throw and degrade discovery; it must fail-open to unauthenticated API. OAuth alone does not explain the cadence drop (ml_api still produced 28 candidates on Sep 24 when invoked).

**Sticky:** `sticky_*` supply runs often report 0 candidates — near-ready cooldown/empty niche, not the volume driver.

---

## FIXES

1. **`persistPriceMemoryFromWorkerMetas`** — worker listing metas → PM tip **before** DQE/S6.1 (observation ≠ mint).
2. Wired into **`processExternalWorkerBatch`** with `[worker-pm]` log.
3. **OAuth fail-open** in `getValidAccessToken` / `proactiveRefreshMercadoLibreToken` on token read failure.
4. **`runPriceMemoryFreshnessCycle`** stale-pool fallback when near-ready empty.
5. **Dedicated cron** `GET /api/cron/pm-freshness` + `vercel.json` schedule `45 15 * * *`.
6. **`readSupplyFreshnessStatus`** — last successful supply/PM tip observability.

Preserved: DQE, S6.1, sole writer, ML_PRICE_MIN_HISTORY_DAYS=4, no second writer, money OFF.

---

## FLOW (authority)

```
ml_worker GHA (*/30ish)
  → POST /api/cron/bot-ingest-candidates
  → processExternalWorkerBatch
  → persistPriceMemoryFromWorkerMetas   ← NEW (Day 5)
  → recordMlDailySnapshots
  → product_price_snapshots

supply-engine (daily dry_run)
  → sticky observe → PM (existing)

/api/cron/pm-freshness (daily)
  → near-ready OR stale PM pool → observe → PM

ml_api_legacy (when BOT_INGEST_DISCOVER_ML + external bot-ingest cron)
  → discoverMercadoLibre → PM (existing; cadence depends on external schedule)
```

---

## CRON

| Endpoint | Schedule | Auth | Mode |
|----------|----------|------|------|
| `/api/cron/supply-engine` | `20 14 * * *` | CRON_SECRET | dry_run default; PM persist yes |
| `/api/cron/pm-freshness` | `45 15 * * *` | CRON_SECRET | observe-only |
| `/api/cron/bot-ingest` | external / not Hobby | CRON_SECRET | `?mode=pm_freshness` also |
| GHA mercadolibre-worker | `7,37 * * * *` | AVENTA_CRON_SECRET | discovery_only default |

---

## STAGING CANARY

`scripts/day5-supply-pm-canary.ts`

| Check | Result |
|-------|--------|
| worker→PM persist | written=3 |
| 2nd persist | written=3 (same-day idempotent upsert) |
| freshness observe | FETCH_BLOCKED=8 (agent ML 403 — correct classification) |
| money / mint | not invoked |

Report: `scripts/_day5_reports/day5-report-latest.json`

---

## PRODUCTION GATE (remaining)

1. **Deploy** worker-PM wire so next GHA cycles write tips without ml_api volume.  
2. **Restore external bot-ingest cadence** if high-volume ml_api discovery is still desired (ops, not code invent).  
3. **Reconnect ML OAuth** when credentials available — system now tolerates DEGRADED without killing discovery.  
4. Do **not** enable machine mint / money to “fix” PM.

---

## DAY 5 STATUS

**DONE** for code + staging evidence of the missing worker→PM link and OAuth fail-open.  
Production tip volume recovery requires **deploy** of this commit (and optionally restoring bot-ingest schedule).
