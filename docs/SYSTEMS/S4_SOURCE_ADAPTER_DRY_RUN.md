# S4 — Source Adapter Dry-Run (ml_worker)

**Status:** Implemented (dry-run only)  
**Date:** 2026-09-18  

## Source selected

`ml_worker` — Mercado Libre Worker listing payload (`ExternalWorkerCandidate`).

**Why:** already in Supply registry; Playwright stays external; lowest new surface; reuses S2 RawObservation + gate + DealScore.

## Dry-run invariants

- `canInsertOffers = false`
- Never writes `offers.pending`
- Never Distribution / Telegram / Rewards
- Sample cap ≤ 50
- Source event id: `ml_worker:ml:{ITEM_ID}` (deterministic)

## Modules

- `lib/supplyIntelligence/sourceAdapter.ts`
- `lib/supplyIntelligence/adapters/mlWorkerListingAdapter.ts`
- `lib/supplyIntelligence/dryRunPipeline.ts`
