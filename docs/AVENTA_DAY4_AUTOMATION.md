# AVENTA — Day 4 Automation Operating System

**Date:** 2026-09-24  
**Branch:** `day4/automation-os`  
**Base:** Day 3 `096469c`  
**Staging:** `oojshofrpbfwsiypcecr`  
**Production:** `mkgsrpsuvedwwlzmzmzh` (read-only diagnosis)

---

## 1. Current architecture

```
Cron / script
  ├─ mode=standard     → runIngestCycle (discovery/eval only)
  ├─ mode=continuous   → runContinuousDiscoveryCycle (dry-run)
  ├─ mode=pm_freshness → runPriceMemoryFreshnessCycle (observe-only PM)
  └─ supply-engine     → sticky observe + router (PM persist in dry_run)

Gates (unchanged authority):
  DQE → S6.1 → S7 → insertIngestedOffer (sole writer) → pending
```

No second writer. No auto-publish. Money OFF.

---

## 2. Automation lifecycle

Stages (code: `lib/bots/ingest/automationLifecycle.ts`):

DISCOVERED → CANONICALIZED → EXTRACTED → IDENTIFIED → PM_ENRICHED →
OFFER_STANDARD → DQE → S6_1 → S7 → WRITTEN → PENDING → MODERATION → PUBLISHED → DISTRIBUTION

Actors per stage: `AUTO | HUMAN | BLOCKED | FAILED | SKIPPED | DUPLICATE`

Loss codes: `NO_CANDIDATES | FETCH_BLOCKED | EXTRACTION_FAILED | IDENTITY_FAILED | PRICE_MISSING | DUPLICATE | DQE_BLOCK | S6_1_BLOCK | WRITER_BLOCK | WRITE_FAILURE | OTHER`

---

## 3. Automation KPI definitions

Code: `lib/bots/ingest/automationCycleMetrics.ts`

| Metric | Formula |
|--------|---------|
| **automation_rate** | `auto_processed / candidate_count` — real pending mint without human |
| **terminal_rate** | `(auto+human+blocked+retryable+failed+duplicates) / candidate_count` |
| **pending_rate** | `pending_created / candidate_count` |

Resistant to:

- **dry-run** → never increments `auto_processed` / `pending_created`
- **duplicates** → counted as `duplicate`, not auto
- **blocked sources** → not success
- **retries** → caller must not double-count identity

Also tracks: `successfully_enriched`, `dqe_verified`, `s61_passed`, `s7_passed`, `written`.

---

## 4. Price Memory freshness diagnosis

### Production evidence (SQL, 2026-09-24 ~22:30 MX)

| Metric | Value |
|--------|------:|
| observations | 4911 |
| unique products | 1636 |
| last_day | **2026-09-24** |
| historyReady | 388 |
| nearReady | 157 |
| rows on last_day | 163 |

MX local time still 2026-09-24 — `last_day` equals **today** (not multi-day stale yet).

### Forensic chain

| Finding | Evidence |
|---------|----------|
| PM **does not** require DQE VERIFIED | `observeStickySkuViaServer` → `recordMlDailySnapshots` before DQE |
| Persist path | `recordMlDailySnapshots` / sticky + `discoverMercadoLibre` priceObservations |
| Cron | `vercel.json` → `/api/cron/supply-engine` daily `20 14 * * *` (dry_run default still persists PM) |
| bot-ingest | **not** in vercel.json — external cron / GHA |
| `ml_api_legacy` | **DEGRADED** `ML_OAUTH_TOKEN_READ_FAILED` |
| `ml_worker` | **healthy**, items_found=36 @ 2026-09-25 01:55 UTC |
| Supply run volume | collapsed: ~100+/day → **12** (Sep 24) → **1** (Sep 25 UTC) |

### Largest real loss

**Operational cadence + ML OAuth degradation** (maps to `FETCH_BLOCKED` / ops), **not** DQE/S6.1/writer.

Agent/Cursor environment 403 is **BLOCKED_EXTERNAL**, not pipeline failure.

### Durable mechanism added

`runPriceMemoryFreshnessCycle` — observe-only near-ready sticky → PM upsert, **never mints offers**.

Trigger: `GET /api/cron/bot-ingest?mode=pm_freshness`

Production gate remaining: healthy ML credentials + supply-engine/pm_freshness actually invoked on schedule. **Do not** enable machine mint in production to “fix” PM.

---

## 5. Retailer matrix

Code: `lib/hunter/retailerCapabilityMatrix.ts`

| Retailer | Discovery | Fetch | Identity | Price | Notes |
|----------|-----------|-------|----------|-------|-------|
| Mercado Libre | IMPLEMENTED | BLOCKED_EXTERNAL* | IMPLEMENTED | IMPLEMENTED | *from agent IPs; prod worker healthy |
| Amazon MX | PARTIAL | PARTIAL | IMPLEMENTED | PARTIAL | PA-API/HTML |
| Liverpool | NOT_IMPLEMENTED | PARTIAL | IMPLEMENTED | PARTIAL | PDP parse only |
| Walmart MX | PARTIAL | PARTIAL | PARTIAL | PARTIAL | Day-to-Day disabled |
| Coppel | NOT_IMPLEMENTED | — | — | — | no source |
| Elektra | NOT_IMPLEMENTED | — | — | — | no source |
| Chedraui / Bodega | PARTIAL | PARTIAL | PARTIAL | PARTIAL | flags off |

---

## 6. Human intervention matrix

Code: `lib/hunter/humanInterventionMatrix.ts`

| Step | Status | Safety |
|------|--------|--------|
| URL paste discovery | **removed** (Day 3 continuous) | no |
| Moderation approve | **required** | yes — no auto-publish |
| DQE POTENTIAL review | exception queue | yes |
| OAuth renew | ops_only | yes |
| Money/payouts | ops_only | yes — OFF |
| Enable retailers | ops_only | yes |

Pattern: **AUTO → EXCEPTION QUEUE → HUMAN ONLY WHEN NEEDED**.

---

## 7. Staging proof

Script: `scripts/day4-automation-os.ts --execute --idempotency`

| Field | Result |
|-------|--------|
| staging PM | 97 obs / 29 products / current day / staleDays=0 |
| freshness cycle | NO_CANDIDATES (near-ready empty post-cooldown) — honest |
| discovery candidates | 3 |
| successfully_enriched | 3 |
| s61_passed | 1 |
| mint | **duplicate** (Day 2 pending identity) |
| automation_rate | **0** |
| terminal_rate | **1** |
| pending (DB) | 1 |
| observations (DB) | 3 |

Report: `scripts/_day4_reports/day4-report-latest.json`

---

## 8. Production blockers

1. `ml_api_legacy` OAuth token read failed (degraded).  
2. Supply-engine invocation frequency collapsed vs mid-September.  
3. Machine mint / auto-publish must stay OFF.  
4. Agent IP 403 ≠ prod worker health.

---

## 9. Exact next highest-leverage objective (Day 5)

**Restore production Price Memory daily cadence:** fix `ML_OAUTH_TOKEN_READ_FAILED`, verify `supply-engine` + optional `pm_freshness` cron fire every MX calendar day, and raise near-ready sticky hit rate — without enabling production mint or auto-publish.
