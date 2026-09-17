# ADR — Deal score boundaries (Signals / DQE / Verifier / Votes)

**Status:** ACCEPTED (P0.1)  
**Date:** 2026-09-16  

## Context

Multiple “scores” exist. Creating another opaque scorer would violate explainability and confuse Moderation / CEO.

| System | Role |
|--------|------|
| DQE | Qualitative gate (coherence, evidence) |
| `computeDealSignals` | Explainable deal quality heuristic + `reasons[]` |
| Verifier | Deterministic ingest score + action *conclusion* (write gated) |
| Vote score | Feed ranking popularity |

## Decision

1. **DealScore v1** = thin contract wrapping `computeDealSignals` output (`score`, `reasons[]`, `evidence[]`, `version`).  
2. **DQE remains the coherence authority** — DealScore does not replace or bypass DQE.  
3. **Verifier remains the ingest conclusion authority** — DealScore does not auto-publish.  
4. **Vote score stays out of Deal Intelligence.**  
5. Research “DQS 0–100” stays **unimplemented** until calibration data justifies replacing Signals+Verifier carefully.

## Consequences

- One explainable deal quality number for DI events  
- No ML opaque model for publication  
- Shadow Autonomous continues to calibrate Verifier vs human — not DealScore alone  

## Forbidden

- Second DQE  
- Auto-publish from DealScore  
- Inventing historical_low to inflate score  
