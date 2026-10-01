# AVENTA — Day 6 Multisource Supply

**Branch:** `day6/multisource-supply`  
**Authority:** origin/master @ Day 5 (`017f291`)

## Objective

Increase Aventa’s ability to discover **real, high-quality** opportunities automatically by making discovery **multisource, isolated, measurable, and prioritized** — without enabling mint/money or weakening DQE/S6.1.

## Bottleneck (evidence)

Production 7d supply (`hunter_supply_runs`):

| Source | Status | Discovered | Notes |
|--------|--------|------------|-------|
| ml_api_legacy | ok/degraded | ~28k | OAuth `ML_OAUTH_TOKEN_READ_FAILED` — volume but brittle |
| ml_worker | healthy | ~1.7k | Day 5 PM path; S6.1 suppresses most (history) |
| amazon_* | skipped/disabled | 0 | missing credentials |
| walmart/bodega/chedraui | disabled | 0 | Day-to-Day OFF |
| Liverpool | — | 0 | identity+extract existed; **no Hunter source** |

Architecture gap: funnel KPIs were **aggregate-only** → could not answer “why did this source produce zero offers?”

## What Day 6 implemented

1. **Canonical source outcomes** — `SUCCESS | PARTIAL | BLOCKED_EXTERNAL | BLOCKED_AUTH | NO_RESULTS | FAILED | SKIPPED | DEGRADED`  
   (`lib/hunter/discovery/sourceDiscoveryStatus.ts`)  
   Never maps auth/external blocks to FAILED.

2. **Per-source funnel** — discovered → identity → PM → Offer Standard → DQE → S6.1 → pending  
   (`lib/bots/ingest/sourceFunnelMetrics.ts`, wired into continuous discovery + `CycleFunnelSummary.by_source`)

3. **Liverpool seed-PDP discovery** — `liverpool_mx` Hunter source  
   - Env: `BOT_INGEST_LIVERPOOL_URLS` (comma/newline PDP URLs)  
   - Uses existing `liv:SKU` identity + PDP extract path  
   - **No search scrape**  
   - Empty env = disabled (safe default)

4. **Acquisition prioritization boosts** (documented, advisory only):  
   - healthy source +8  
   - down/disabled −12  
   - daysUntilReady ≤1 +15; ≤3 +8  
   Does **not** replace DQE/S6.1.

5. Continuous discovery now treats Liverpool SKU as first-class identity (alongside ML/Amazon).

## Safety

- money / rewards / commissions / settlement / distribution: unchanged OFF  
- machine mint: OFF  
- auto-publish: OFF  
- `ML_PRICE_MIN_HISTORY_DAYS = 4` intact  
- sole writer / DQE / S6.1: untouched  

## Staging canary

```bash
npx tsx --env-file=.env.local scripts/day6-multisource-supply-canary.ts
```

Optional:

```bash
# staging only — real Liverpool PDPs you already trust
BOT_INGEST_LIVERPOOL_URLS="https://www.liverpool.com.mx/tienda/pdp/.../SKU"
```

## Next highest-leverage objective

Accumulate PM history from `ml_worker` (+ optional Liverpool seeds) until more SKUs cross the 4-day `historyReady` gate — that unlocks S6.1 VERIFIED volume without weakening gates.
