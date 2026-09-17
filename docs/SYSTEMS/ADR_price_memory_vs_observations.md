# ADR — Price Memory evolution vs `price_observations`

**Status:** ACCEPTED (P0.1)  
**Date:** 2026-09-16  
**Deciders:** Deal Intelligence P0.1 foundation  

## Context

Deal Intelligence needs append-only price observations with provenance. Aventa already has:

1. **`offer_price_snapshots`** — append-only per `offer_id` (published/moderation unit)  
2. **`product_price_snapshots`** — Price Memory: one row per `(marketplace, product_id, recorded_on)` with upsert of `last_price` and ratchet of `min_price` (ML-only CHECK today)

A naive new `price_observations` table would duplicate writes and confuse SoT.

## Decision

**P0.1: No new table.**

1. Ship **TypeScript contract** `PriceObservation` as the canonical *logical* model.  
2. Treat existing stores as **adapters/backends**:
   - Offer-bound history → `offer_price_snapshots`
   - ML daily product memory → `product_price_snapshots`
3. Document mapping functions in code (`toPriceObservationFrom*` when needed).  
4. Defer physical `price_observations` until **P1** when tick-level multi-source volume or Amazon history requires it — and only with an additive migration + dual-write plan.

## Consequences

- No migration in this phase → zero prod schema risk  
- Historical low remains gated by `historyReady` / existing Price Memory rules  
- CEO must not treat “Price Memory healthy” as “DI observations CONNECTED”  

## Rejected alternative

Creating `price_observations` immediately “for cleanliness” — introduces dual-write debt before any consumer needs ticks.
