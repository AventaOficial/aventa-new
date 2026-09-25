# AVENTA — Machine Contract

**Status:** OFFICIAL conceptual contract (Day 1)  
**Date:** 2026-09-24  
**Rule:** Do not change public interfaces unless a P0 invariant requires it. This document locks meaning and authority.

Pipeline object chain:

```
Candidate
  → ParsedProduct
  → ProductIdentity
  → PriceObservation
  → PriceMemory
  → DealSignals
  → DealQuality
  → Decision
  → Ingestion
  → Publication
```

---

## 1. Candidate

| | |
|--|--|
| **Meaning** | A URL/SKU/query hit worth fetching — pre-quality. |
| **Required fields** | `url` or marketplace product id; `source`; discovery timestamp; optional query/family/niche. |
| **Authority** | Hunter discovery (`engine`, sources, worker, supply router). Offer Standard may **rank** candidates only. |
| **Lifecycle** | ephemeral → collected → enriching → gated → discarded/lost. |
| **Idempotency** | Dedupe by canonical URL / fingerprint within cycle; negative memory may suppress repeats. |
| **Failure** | Record loss bucket (unreachable, blocked, budget, circuit). Do not invent parsed fields. |

---

## 2. ParsedProduct

| | |
|--|--|
| **Meaning** | Structured listing after fetch/extract (`ParsedOfferMetadata` and kin). |
| **Required fields** | title **or** product id; price if deal path; currency; image optional but gated later; raw provenance. |
| **Authority** | Enrichment / parsers (`enrichParsedOffer`, ML public, HTML). |
| **Lifecycle** | raw → normalized → signal-enriched. |
| **Idempotency** | Same URL re-parse may overwrite cycle-local meta; must not write offers. |
| **Failure** | Partial parse allowed; mark missing evidence; weak listing-card provenance must not fake PDP. |

---

## 3. ProductIdentity

| | |
|--|--|
| **Meaning** | Stable key for “same product/listing” across observations. |
| **Required fields** | `ingestion_identity_key` (or explicit `none` / weak policy); marketplace; native id when strong (ASIN, ML item id, Liverpool SKU, …). |
| **Authority** | `lib/offers/ingestion/identity.ts` + URL fingerprint helpers. |
| **Lifecycle** | resolved once per ingest attempt; UNIQUE on offers when present. |
| **Idempotency** | Strong identity → conflict merges/rejects per `onDuplicate`. Weak short-links must not pretend strong. |
| **Failure** | Fail-closed to weak/none rather than colliding unrelated products. |

---

## 4. PriceObservation

| | |
|--|--|
| **Meaning** | One price sighting for a product (or offer) at a time. |
| **Required fields (ML product)** | `productId`, `current` > 0; optional list/regular; optional `nicheId`. |
| **Authority** | `recordMlDailySnapshots` / quotes from discovery, sticky, priceIntel. Offer trail: `offer_price_snapshots` (separate, sparse). |
| **Lifecycle** | observed → upserted into daily snapshot. |
| **Idempotency** | One row per `(marketplace, product_id, recorded_on)`; intraday min ratchet. |
| **Failure** | Skip invalid ids (e.g. ML user-product keys); never fabricate historical lows. |

---

## 5. PriceMemory

| | |
|--|--|
| **Meaning** | Computed intel over daily snapshots (`MlPriceIntel`). |
| **Required fields when ready** | `historyReady=true`, `habitual30d`, `lowest30d`, `lowest90d`, `current`, effective discount / artificial flags. |
| **Authority** | `computeMlPriceIntel` only. Contract: `ML_PRICE_MIN_HISTORY_DAYS = 4` prior days. |
| **Lifecycle** | not_ready → ready; metrics null until ready. |
| **Idempotency** | Pure function of observation + history rows + today YMD. |
| **Failure** | If not ready → null historical metrics; DQE must see `insufficient_price_history`. |

---

## 6. DealSignals

| | |
|--|--|
| **Meaning** | Normalized inputs to quality (price, discount, availability, image validity, provenance, memory flags, qualification result). |
| **Required fields** | Bound from parsed meta + Price Memory + qualification; no silent defaults that invent discounts. |
| **Authority** | `fromParsedMeta`, qualification, evidence helpers — **not** Offer Standard DemandLevel (acquisition-only). |
| **Lifecycle** | assembled per evaluation. |
| **Idempotency** | Deterministic for same inputs + policy version. |
| **Failure** | Missing signal → explicit `missing[]` / low confidence; do not upgrade to VERIFIED. |

---

## 7. DealQuality

| | |
|--|--|
| **Meaning** | DQE decision object (`DealQualityDecision`). |
| **Required fields** | `kind` (VERIFIED / POTENTIAL / NO_VERIFIED / REJECT / DUPLICATE / …); reasons; confidence; recommended action. |
| **Authority** | `evaluateDealQuality` (+ evidence reconcile). Sole quality authority for “is this a deal?”. |
| **Lifecycle** | evaluated → optionally stored in `bot_meta` / telemetry. |
| **Idempotency** | Same signals + rules version → same kind. |
| **Failure** | Reject / no-verified; never mint around DQE. |

---

## 8. Decision

| | |
|--|--|
| **Meaning** | Machine mint eligibility after DQE — S6.1 gate (`evaluateMachineCandidateGate`) and write auth. |
| **Required fields** | wouldInsert boolean; gate reason codes; provenance bind; write-auth outcome. |
| **Authority** | S6.1 + `machineWriteAuth` / eligibility. S7 bridge consumes Decision, does not redefine quality. |
| **Lifecycle** | gated → allowed | denied | dry_run. |
| **Idempotency** | Re-check S6.1 at insert boundary (`insertIngestedOffer`). |
| **Failure** | Deny insert; discovery may continue. Production deny is expected when writes OFF. |

---

## 9. Ingestion

| | |
|--|--|
| **Meaning** | Persist opportunity as pending offer + observation evidence. |
| **Required fields** | Validated create body; `createdBy`; `source`; identity; status **pending** for machine. |
| **Authority** | **Sole writer** `ingestOfferObservation`. Facades: community API, `insertIngestedOffer`, S7 bridge. |
| **Lifecycle** | create | merge-pending | observe-only on duplicate policy. |
| **Idempotency** | Observation idempotency key; identity UNIQUE; fingerprint slots. |
| **Failure** | No partial approved mint; no money side effects; return structured error. |

---

## 10. Publication

| | |
|--|--|
| **Meaning** | Transition to public/live feed eligibility (`approved`). |
| **Required fields** | Human moderation decision; affiliate/readiness checks as configured. |
| **Authority** | Admin moderation API — **human** today. Auto-publish boundary remains `false`. |
| **Lifecycle** | pending → approved | rejected. |
| **Idempotency** | Moderation locks / single transition semantics. |
| **Failure** | Remain pending/rejected; do not enqueue distribution if engine OFF; never imply settlement. |

---

## Cross-cutting invariants

1. **Offer Standard ≠ DQE ≠ Publication ≠ Money.**
2. **One offers insert authority** in production app code.
3. **Price Memory fail-closed** without 4 prior days.
4. **Machine may only create pending**, never approved, under current policy.
5. **Money path frozen** in production unless explicitly thawed — Day 1 does not thaw.
6. **Publication does not activate monetization.**

---

## Versioning

- Contract version: **Day1 / 2026-09-24**
- Rules version for DQE: `DEAL_QUALITY_RULES_V1` / `DEAL_QUALITY_POLICY_V1`
- Supersedes informal contradictions in older S65 narrative where they conflict with sole-writer + S6.1 re-check code on this branch.
