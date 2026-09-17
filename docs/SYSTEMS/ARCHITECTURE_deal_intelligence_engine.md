# DEAL INTELLIGENCE ENGINE — ARCHITECTURE AUDIT

**Date:** 2026-09-16  
**Mode:** Audit only — no code, no deploy, no money, no Supply WRITE  
**Precedence:** Live code + `docs/AVENTA_SOURCE_OF_TRUTH.md` > research docs  

**Related:** [`RESEARCH_supply_intelligence_engine.md`](./RESEARCH_supply_intelligence_engine.md) (target vision), Hunter Supply Orchestration, Economy fail-closed stack.

---

## Current Architecture

Aventa already runs a **single deal quality pipeline**, not a blank slate:

```
SOURCE (HunterSource / worker / community)
  → IngestItem / SupplyCandidate
  → Enrichment + Price Memory (ML daily / Keepa Amazon path)
  → Deal Qualification (VERIFIED / PROMOTION / catalog…)
  → DQE (evaluateDealQuality)
  → Verifier (score + conclusion)
  → Autonomous Decision (SHADOW ONLY)
  → insert pending (gates: SUPPLY_ENGINE_WRITE, legacyAutoApprove OFF in prod)
  → Moderation OS (HITL)
  → Feed
```

**Economic path is orthogonal and fail-closed** (attribution → conversion/commission foundation → adapters; settlement/rewards/payouts OFF). Deal Intelligence must **not** invent commissions or wire ledger writes.

**Job brokers:** There is **no** Bull/Inngest candidate queue. Redis/Upstash = rate-limit. `write_jobs_queue` = click/event telemetry, not offer ingest.

---

## Existing Reusable Systems

| System | Path | Reuse for Deal Intelligence |
|--------|------|------------------------------|
| Supply Orchestration | `lib/hunter/supply/engine.ts`, `router.ts` | Backbone; extend modes, don’t fork |
| Source registry | `lib/hunter/types.ts` `HunterSource`, `lib/hunter/sources/*` | Evolve into `DealSourceAdapter` capabilities |
| Day-to-Day factory | `lib/hunter/dayToDay/createRetailerSource.ts` | Retailer adapters |
| Sticky + Price Memory | `observeStickySkus.ts`, `mlPriceEngine.ts`, `product_price_snapshots` | Fresh price observation (ML) |
| Offer price snapshots | `offer_price_snapshots`, `lib/offers/priceHistory.ts` | Append-only per **offer** |
| Fingerprint dedupe | `product_fingerprint`, `findDuplicateOffer.ts` | Event/product dedupe within marketplace |
| DQE | `lib/hunter/dealQuality/*` | Coherence authority (not ML score) |
| Deal Signals | `lib/hunter/supply/dealSignals.ts` | Explainable score seed (`reasons[]`) |
| Qualification | `lib/hunter/dealQualification/*` | Promo vs catalog evidence |
| Verifier | `lib/verifier/*` | 0–100 + action conclusion |
| Autonomous + calibration | `lib/autonomous/*` | Shadow labels for future DQS |
| Community pipeline | `communityPipeline.ts` | Same quality contract |
| Publisher gates | `insertIngestedOffer`, `resolveBotInsertPublication` | Fail-closed publish |
| Moderation OS | `lib/moderation/*` | Human gate before live |
| Supply Truth / health | `hunter_supply_runs`, `hunter_source_health` | Source observability |
| CEO panels | `lib/owner/*` | Bottlenecks + health |
| ML Playwright worker | `workers/mercadolibre-worker` | Discovery-only; not sticky PDP |
| Amazon sources | PA-API / ASIN / Keepa (code paths) | Catalog/price; **not** commission truth |

---

## Missing Systems

| Capability | Status |
|------------|--------|
| `canonical_products` graph (cross-merchant) | **MISSING** |
| Tick-level multi-source `price_observations` | **MISSING** (have daily ML upsert + per-offer append) |
| `coupon_observations` / outcome (works/expired) | **MISSING** (text fields on `offers`) |
| `promotion_observations` / stacking rules | **MISSING** (PROMOTION = qualification enum only) |
| Persisted `deal_scores` + feature versioning | **MISSING** (runtime + `bot_meta`) |
| `deal.detected` event bus / detector registry | **MISSING** (logic embedded in DQE/signals) |
| Merchants table (vs `store` string) | **MISSING** |
| Candidate job queue (broker) | **MISSING** (cron + GHA cycles) |
| Formal `DealSourceAdapter` with supported/unsupported/unknown | **PARTIAL** (`HunterSourceCapabilities` too narrow) |
| Cross-merchant arbitrage detector | **MISSING** |
| Coupon/Bank hunters | **PLANNED** (`modules.ts`) |

---

## Canonical Data Model

### What exists today

| Identity | Representation |
|----------|----------------|
| Published offer | `offers.id` (uuid) |
| Marketplace fingerprint | `amz:{ASIN}` \| `ml:{ITEM}` on `offers.product_fingerprint` (+ UNIQUE partial) |
| ML Price Memory key | `(marketplace='mercadolibre', product_id, recorded_on)` |
| Merchant | `offers.store` **string only** |
| GTIN/EAN/UPC | **No column**; occasional HTML parse only |
| Variants (color/storage/size) | **Not modeled** as first-class fields |

### Cross-merchant equality (Amazon X = ML Y = Z)

**NOT_SUPPORTED today.** No deterministic join key across marketplaces without GTIN/official catalog link.

### Recommended identity layers (design — not implement yet)

| Layer | Meaning | Confidence |
|-------|---------|------------|
| **exact** | Same marketplace + same merchant_product_id / ASIN / ML item | high |
| **probable** | Shared GTIN/EAN/UPC verified from authorized source | medium–high + score |
| **unknown** | Title/brand/model heuristics only | must stay unmerged |

**Rule:** Never auto-merge probable→canonical without confidence threshold + audit trail. No probabilistic matching without explicit `confidence`.

---

## Source Adapter Model

**Evolve `HunterSource` → `DealSourceAdapter`** (same registry; widen capabilities):

| Capability | Declare |
|------------|---------|
| catalog | supported / unsupported / unknown |
| price | … |
| availability | … |
| promotion | … |
| coupon | … |
| product_identity | … |
| historical_data | … |
| realtime_events | … |

**Priority order (policy):** official APIs → official feeds → authorized providers → public structured data where permitted → browser extraction only with technical+legal justification.

**NO-GO:** CAPTCHA bypass, anti-bot evasion, auth barrier bypass, invented endpoints.

**Current source reality:**

| Source | Price | History | Promo/coupon | Notes |
|--------|-------|---------|--------------|-------|
| ML API / sticky observe | supported (API) | own snapshots | limited / unknown stacking | Live |
| ML Playwright worker | discovery cards | via sticky/API | weak card evidence | Discovery-only prod |
| Amazon PA-API / ASINs | partial | Keepa path (may be OFF) | DealDetails limited | Not commission API |
| Day-to-Day retailers | flags OFF | unknown | unknown | Factory ready |
| Community submit | user URL | after ingest | user-claimed | Always pending |

---

## Price Intelligence

| Store | Behavior | Gap vs ideal |
|-------|----------|--------------|
| `offer_price_snapshots` | Append-only per offer | Tied to published offer, not product entity |
| `product_price_snapshots` | 1 row/day upsert ML; `min_price` ratchets down | Not tick-level; Amazon CHECK blocked |
| `offers.price` | Overwrite | Presentation only |
| `offer_health_state` | Latest check overwrite | No check history |

**Target observation (design):** append-only `price_observations` with product identity, merchant, source, `observed_at`, currency, list/sale/effective, coupon/shipping/financing attrs, availability, seller, URL, metadata, `extraction_confidence`, `schema_version`.

**Aggregates** (24h/7d/30d/90d/all-time min/median/percentiles/volatility): derive from observations or maintain rollup tables later (P1). Do **not** invent historical lows without `historyReady`.

---

## Promotion Intelligence

Today: `offers.coupons` (text), `bank_coupon` enum, `msi_months`, qualification `PROMOTION`.

**Missing:** typed promotions, stackability evidence, coupon outcome, bank vs seller vs marketplace distinction as observations.

**Effective price formula** (only when evidence says combinable):

```
base
+ merchant_discount   (if evidenced)
+ coupon              (if verified + combinable)
+ payment_discount    (if evidenced)
+ shipping            (if known)
= effective_price
```

If stacking unknown → report components separately; **never invent final price**.

Coupon/Bank modules remain **planned** — P1 after observation model.

---

## Deal Score

**Naming collision (must freeze vocabulary):**

| Name | Role today |
|------|------------|
| `dealSignals.dealScore` | Explainable heuristic + `reasons[]` |
| Verifier / `scoreIngestCandidate` | 0–100 ingest conclusion |
| DQE | Qualitative decision (not 0–100 DQS) |
| Vote `computeOfferScore` | Feed popularity — **not** deal quality |
| Research “DQS” | Future unified 0–100 |

**P0 foundation:** Treat `computeDealSignals` + DQE + Verifier as the explainable stack. Persist score snapshots later (`deal_scores`) with `score`, `confidence`, `reasons[]`, `warnings[]`, `feature_version`.

**Do not** ship opaque ML for publication decisions yet.

**Do not** auto-publish from score alone.

---

## Deduplication

| Level | Today | Gap |
|-------|-------|-----|
| Event | Cycle dedupe in supply router | No durable event idempotency key store |
| Product | `product_fingerprint` UNIQUE (amz/ml) | Cross-merchant none |
| Deal | DQE duplicate signals | No time-windowed “same deal” entity |
| Publication | Moderation + fingerprint cooldown | OK for current scale |

Design: `idempotency_key` (source+external_id+observed_at bucket), `dedupe_key` (fingerprint+price+coupon hash), TTL for deal-level silence windows.

---

## Event Pipeline

**Recommended shape (aligns with existing stages; add explicit events):**

```
SOURCE → ADAPTER → RAW EVENT → VALIDATE → NORMALIZE
→ PRODUCT RESOLUTION → PRICE OBSERVATION → PROMOTION RESOLUTION
→ DEAL EVALUATION → DEDUPE → QUEUE → MODERATION / PUBLICATION
```

Emit **`deal.detected`** (and similar) as **normalized events**, never as direct publish.

Properties: idempotent, observable, retryable, auditable; schema_version; extraction_confidence; dead-letter for poison payloads.

---

## Queue Architecture

| Need | Recommendation |
|------|----------------|
| Current ≤ ~5–10k candidates/day | Keep cron + GHA + DB locks (**reuse**) |
| 100k+/day | **P1:** candidate job queue (Postgres-backed or Redis broker) + horizontal workers |
| Click telemetry | Keep `write_jobs_queue`; increase `process-write-queue` frequency under load |
| Do not | Reimplement DQE inside a new queue worker as a second pipeline |

---

## Observability

**Already:** Supply Today, Supply Truth, `hunter_source_health`, Price Memory health, Moderation backlog, CEO circuit bottleneck, calibration shadow vs human.

**Add (P0 metrics definitions, P1 wiring):** events/h, products/h, price_obs/h, deals_detected/h, duplicate_rate, source_error_rate, median ingest latency, detection latency, publication eligibility, queue depth, false_positive_rate (from calibration).

Distinguish: **source healthy** vs **source delivering suspicious prices** (DQE artificial list + Price Memory disagreement).

---

## Scaling Analysis

| Scale | Verdict |
|-------|---------|
| 5k offers/day | Current architecture OK (dry_run / budgets) |
| 10k/day | GHA + Playwright duration drift; sticky budgets |
| 100k/day | Price Memory read patterns, ML API limits, single-cycle sync DQE, write-queue daily cron |
| 1M events/day | **Structural:** need candidate queue, partitioned observations, worker fan-out — **not** another quality stack |

Hotspots: O(n) per-candidate sync on Vercel isolate; unbounded in-memory candidate arrays; Supabase row read ceilings on health queries; sticky 24/wave caps (intentional safety).

---

## Security

- Client never authority for price/commission/identity economic facts  
- Server-only ingest for money path (unchanged)  
- No fake prices / coupons / historical lows  
- No ledger/settlement/payout activation from Deal Intelligence  
- `SUPPLY_ENGINE_WRITE` and `legacyAutoApproveWriteEnabled` remain fail-closed  

---

## Policy Constraints

| Constraint | Implication |
|------------|-------------|
| Amazon Associates / Creators | Catalog ≠ commission; no invented economic APIs |
| ML Affiliates | No official affiliate economic API (confirmed research) |
| Subtags identifying end users | Forbidden (Amazon policy) |
| Scraping / anti-bot bypass | NO-GO |
| Seller promotions APIs | Often require seller token — **UNKNOWN/NOT_SUPPORTED** for affiliate app |

---

## Database Changes

| Change | Priority | Notes |
|--------|----------|-------|
| Document/extend fingerprint as `merchant_product_identity` | P0 design | May be view/convention before new table |
| `price_observations` append-only (or generalize Price Memory) | P0 | Prefer additive; don’t break `product_price_snapshots` consumers |
| Rollups / indexes for 30/90d queries | P1 | |
| `canonical_products` + links | P1–P2 | Only with exact/probable confidence model |
| `coupon_observations` / `promotion_observations` | P1 | |
| `deal_scores` | P1 | After signal contract frozen |
| Merchants table | P2 | |
| Money tables | **NO-GO** for this engine |

**Rule:** Additive, RLS-aware, no destructive rewrites of `offers` as product entity.

---

## API Changes

| API | Priority |
|-----|----------|
| Internal: record price observation / deal.detected (server-only) | P0–P1 |
| CEO: deal intelligence health + source suspicion | P1 |
| Public publish APIs | **NO-GO** auto mass publish |
| Affiliate commission invent endpoints | **NO-GO** |

---

## Worker Changes

| Change | Priority |
|--------|----------|
| Keep ML worker discovery-only | P0 (safety) |
| Emit normalized raw events (schema_version) into shared pipeline | P1 |
| Horizontal candidate workers | P1 at 100k |
| Amazon browser scraper worker | **NO-GO** (use PA-API/Keepa) |
| Playwright sticky PDP | **NO-GO** (abandoned; use API sticky) |

---

## Test Plan

Contracts (extend existing hunter/bots suites; don’t rename vote score):

- source adapter capability matrix  
- normalized product identity (exact only first)  
- price observation append + idempotent replay  
- promotion reject when stack unknown  
- deal score reasons/warnings stable for same input  
- dedupe: duplicate event → one canonical  
- bad source → no publication  
- uncertain/stale price → confidence↓ / stale flag  
- currency / variant mismatch → reject or unknown  
- `NOT_SUPPORTED` capabilities fail closed  
- money path untouched (`settlementEnabled=false`, no ledger writes)  
- `SUPPLY_ENGINE_WRITE` gate tests remain green  

---

## P0 / P1 / P2

### P0 — Deal Intelligence foundation (smallest correct core)

1. **Freeze vocabulary** (DQE vs Deal Signals vs Verifier vs Vote score vs future DQS).  
2. **Architecture doc + module map** linking Deal Intelligence → existing Supply (this audit).  
3. **Widen capability declarations** on sources (`supported|unsupported|unknown`) without new scrapers.  
4. **Specify** `price_observation` + `deal.detected` contracts (types/docs/tests) before tables.  
5. **Identity policy:** exact / probable / unknown — no auto cross-merchant merge.  
6. **Keep** money + Supply WRITE + auto-publish fail-closed.  

### P1 — Scale + richness

1. Persist append-only observations (generalize beyond daily ML upsert).  
2. Candidate queue + worker fan-out.  
3. Coupon/promotion observations with stackability evidence.  
4. Persist `deal_scores` with feature_version.  
5. Detector registry (price drop, hist low, coupon, flash, back-in-stock, …) emitting events.  
6. CEO metrics for DI bottlenecks.  

### P2 — Optimization / moat

1. Canonical product graph with GTIN-backed probable matches.  
2. Cross-merchant arbitrage.  
3. Rollup aggregates / partitioning.  
4. Calibrated DQS replacing overlapping scores carefully.  

---

## NO-GO Items

- Activating settlement / rewards / payouts / ledger writes  
- `SUPPLY_ENGINE_WRITE=1` as part of this foundation phase  
- Mass auto-publish / re-enabling legacy auto-approve writes in production  
- Second parallel quality pipeline  
- Invented Amazon/ML affiliate economic APIs  
- Probabilistic product merge without confidence  
- Invented effective prices / coupons / historical lows  
- CAPTCHA/anti-bot bypass / unauthorized access  
- Production scraping expansion without legal+technical justification  
- Bull/Inngest “because queues” while duplicating DQE  
- Playwright sticky PDP revival  
- Treating PAAPI/Creators as commission truth  

---

## Exact Next Phase

**P0.1 — Contract freeze (no production tables yet):**

1. Add `docs/SYSTEMS/SYSTEM_deal_intelligence.md` as the living system contract (vocabulary + pipeline + reuse map).  
2. Define TypeScript contracts only: `DealSourceCapabilities`, `PriceObservation`, `DealDetectedEvent`, identity confidence enums — **wired to existing Hunter/DQE types**, not a fork.  
3. Add failing-or-passing contract tests that lock: same input → same identity; money untouched; unknown capability → NOT_SUPPORTED.  
4. Explicit decision record: **evolve Price Memory → observations** vs **new table beside it** (choose one before migration).

**STOP.** Do not deploy. Do not activate money. Do not enable Supply WRITE. Do not implement unverified provider APIs.
