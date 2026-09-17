# SYSTEM — Deal Intelligence Engine (P0.1 Foundation)

**Status:** LIVE (contracts + pure builders) — **no persistence layer yet**  
**Date:** 2026-09-16  
**SoT precedence:** this contract + live Supply/DQE code > research drafts  

## Purpose

Convert multi-source product/price events into **evaluated, evidenced, non-publishing** deal signals — reusing the existing Supply pipeline. Deal Intelligence does **not** replace DQE, Verifier, or Moderation OS.

## Pipeline (unchanged)

```
SOURCE → IngestItem → Enrichment → Price Memory → Qualification
→ DQE → Verifier → Autonomous SHADOW → pending → Moderation → Feed
```

Deal Intelligence adds **typed contracts + builders** beside this path. It does **not** insert a second quality stack.

## Vocabulary freeze

| Term | Authority | Publishes? |
|------|-----------|------------|
| **DQE** | Coherence / reject-or-continue | No |
| **Deal Signals / DealScore v1** | Explainable heuristic (`computeDealSignals`) | No |
| **Verifier score** | Ingest conclusion 0–100 | No (prod auto-approve write OFF) |
| **Vote score** | Feed popularity | N/A to deal quality |
| **DQS (research)** | Future unified score — **not implemented** | — |

## Module map

| Concern | Code |
|---------|------|
| Contracts + builders | `lib/dealIntelligence/*` |
| Price history (offer) | `offer_price_snapshots` |
| Price Memory (ML product/day) | `product_price_snapshots` / `mlPriceEngine` |
| Explainable score | `lib/hunter/supply/dealSignals.ts` via `buildDealScoreFromSignals` |
| Source capabilities | `resolveDealSourceCapabilities` + optional `HunterSource.dealCapabilities` |
| CEO truth | `buildDealIntelligenceTruth` |

## Fail-closed

- `DEAL_INTELLIGENCE_ENABLED` default **false** for any future ingest persistence  
- Settlement / rewards / payouts / ledger: **OFF** (`DEAL_INTELLIGENCE_ECONOMY_BOUNDARY`)  
- Supply WRITE: unchanged (`SUPPLY_ENGINE_WRITE`)  
- Auto-publish: unchanged (legacy auto-approve write OFF in production)  
- `deal.detected` events are **in-memory / contract-only** until an ADR authorizes persistence  

## Connection states (CEO)

| State | Meaning |
|-------|---------|
| `NOT_CONNECTED` | No DI persistence / ingest path wired |
| `CONNECTED_ZERO` | Path live, zero observations/events |
| `CONNECTED_WITH_DATA` | Observations or deal.detected persisted |

**Today:** `NOT_CONNECTED` for event persistence. Price Memory remaining healthy ≠ Deal Intelligence connected.

## Scaling model (design — no new brokers yet)

| Scale | Strategy |
|-------|----------|
| 5k/day | Existing cron + GHA + DB locks |
| 10k/day | Sticky budgets + worker schedule hygiene |
| 100k/day | P1: candidate queue + observation rollups + indexes |
| 1M/day | Horizontal workers + partitioned observations — **not** a second DQE |

Retention: keep logical observations short-hot; rollups for 30/90d; raw ticks optional later.

## Security model

External source data is untrusted. Client never authorities price/merchant/coupon/commission. Server-side canonical when available. No PII in DI contracts.

## Economy boundary

`DEAL_INTELLIGENCE_ECONOMY_BOUNDARY.settlementEnabled = false` forever in this foundation. DI does not create conversions/commissions/ledger/rewards/payouts.

## Related ADRs

- [`ADR_price_memory_vs_observations.md`](./ADR_price_memory_vs_observations.md)
- [`ADR_deal_score_boundaries.md`](./ADR_deal_score_boundaries.md)
- [`ARCHITECTURE_deal_intelligence_engine.md`](./ARCHITECTURE_deal_intelligence_engine.md)
