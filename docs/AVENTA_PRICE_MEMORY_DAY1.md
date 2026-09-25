# AVENTA — Price Memory Day 1 Report

**Query date (DB `current_date`):** 2026-09-25 (UTC)  
**Product timezone for writers:** `America/Mexico_City` (`ML_PRICE_TZ`)  
**Last recorded_on in prod:** 2026-09-24  
**Sources:** Read-only Supabase MCP `execute_sql` on production project `mkgsrpsuvedwwlzmzmzh` (`Aventa Cazadores de ofertas`). Staging `oojshofrpbfwsiypcecr` checked for contrast only.  
**Code contract:** `lib/bots/ingest/mlPriceEngine.ts` — `ML_PRICE_MIN_HISTORY_DAYS = 4`  
**Mutations:** NONE (SELECT only). History not deleted or altered.

---

## 1. Executive verdict

| Code | Meaning | Applies? |
|------|---------|----------|
| **A** | Accumulating correctly | **YES** |
| **B** | Accumulating but insufficient for DQE majority | **YES** |
| **C** | Accumulating incorrect data | **NO** (quality checks clean) |
| **D** | Not accumulating | **NO** |
| **E** | Accumulating duplicates | **NO** (0 duplicate key proxy) |
| **F** | Data unusable for DQE | **PARTIAL** — usable when `historyReady`; majority not ready |

**Summary:** Price Memory is real and healthy. After multi-week accumulation (first_day 2026-08-20) plus continued daily writes through 2026-09-24, **23.7%** of products meet the `historyReady` contract. The last ~3 calendar days show active intake (163–240 products/day) but **sticky multi-day coverage on the same SKUs is the bottleneck**, not total row count.

---

## 2. Totals (production)

| Metric | Value |
|--------|------:|
| total observations (rows) | **4911** |
| unique products | **1636** |
| distinct calendar days | **36** |
| first_day | 2026-08-20 |
| last_day | 2026-09-24 |
| marketplace / retailers | **mercadolibre only** (4911 rows) |

### Staging contrast

| Metric | Value |
|--------|------:|
| total observations | 21 |
| unique products | 12 |
| distinct days | 2 (2026-09-21 … 2026-09-22) |

Staging is **not** the Price Memory accumulation surface.

---

## 3. Distribution by day (last 14 recorded days)

| recorded_on | rows (= products/day) |
|-------------|----------------------:|
| 2026-09-24 | 163 |
| 2026-09-23 | 189 |
| 2026-09-22 | 240 |
| 2026-09-21 | 229 |
| 2026-09-20 | 314 |
| 2026-09-19 | 296 |
| 2026-09-18 | 263 |
| 2026-09-17 | 289 |
| 2026-09-16 | 334 |
| 2026-09-15 | 406 |
| 2026-09-14 | 80 |
| 2026-09-13 | 108 |
| 2026-09-12 | 113 |
| 2026-09-11 | 107 |

Daily volume is healthy; Sep 15 spike then gradual decline is visible — still writing every day through Sep 24.

---

## 4. Distribution by niche (`niche_id`)

| niche | rows | products |
|-------|-----:|---------:|
| (null/legacy) | 4366 | 1441 |
| electronics | 221 | 182 |
| day_to_day | 168 | 105 |
| beauty | 156 | 104 |

Most history predates or bypasses niche tagging. New supply-engine writes should set niche when known (Gap P2-4).

---

## 5. Depth / historyReady

### Per-product observation depth (all time)

| Threshold | Products |
|-----------|---------:|
| ≥1 obs | 1636 |
| ≥2 obs | 799 |
| ≥3 obs | 545 |
| ≥4 obs | 388 |
| exactly 1 distinct day | 837 |
| exactly 2 days | 254 |
| exactly 3 days | 157 |
| ≥5 days | 299 |
| avg obs / product | 3.00 |
| avg distinct days | 3.00 |

### Contract-aligned `historyReady` (prior days in 90d window, excluding DB `current_date`)

| Metric | Count | % of products |
|--------|------:|--------------:|
| **historyReady** | **388** | **23.7%** |
| **notReady** | **1248** | **76.3%** |
| exactly 3 prior days (one day from ready) | 157 | 9.6% |

### Last ~3 days cohort (`recorded_on >= current_date - 3`)

| Metric | Count |
|--------|------:|
| products touched | 422 |
| ready among recent | 168 (39.8%) |
| not ready among recent | 254 |
| at 3 prior days | 36 |
| at 2 prior days | 63 |
| at 1 prior day | 155 |

### Window Sep 21–24 (inclusive) sticky depth

| Metric | Count |
|--------|------:|
| products with ≥1 day in window | 545 |
| ≥2 days in window | 189 |
| ≥3 days in window | 66 |
| ≥4 days in window | 21 |

Interpretation: many SKUs are seen once in a multi-day window; few are re-observed daily. That matches why all-time ready count (388) exceeds in-window-4-day count (21) — readiness comes from **older** history, not from the last 3 days alone.

---

## 6. Data quality

| Check | Result |
|-------|--------|
| duplicate (marketplace, product_id, recorded_on) | **0** |
| null last_price / min_price | **0** |
| non-positive prices | **0** |
| min_price > last_price | **0** |
| list_price < last_price | **0** |

**Anomalies:** none detected on these invariants.

**Idempotency:** UNIQUE + upsert with intradaily `min_price` ratchet — duplicates are collapsed by design, not piled.

---

## 7. Related tables (context)

| Table | Count | Note |
|-------|------:|------|
| `offer_price_snapshots` | 10 | Not product Price Memory |
| `offer_observations` | 0 | Evidence lane empty (Gap P0-2) |
| `offers` | 766 | 76 approved, 0 pending |

---

## 8. What changes at day 4 (contract)

When a product reaches **≥4 distinct prior days**:

- `historyReady = true`
- `lowest30d` / `lowest90d` / `habitual30d` become numeric
- DQE can fire `price_below_habitual`, near/at historical low, and strong-history rescue toward `VERIFIED_DEAL`
- Without readiness, DQE keeps `insufficient_price_history` / missing `price_history`

**If the 157 products at 3 prior days are re-observed tomorrow**, they become ready (upper bound +157 → ~545 ready ≈ 33% of catalog) — only if sticky observation continues.

**Of products touched in the last 3 days, ~40% already benefit from Price Memory in DQE today.** The other ~60% of that active cohort still cannot.

---

## 9. What still blocks Price Memory usefulness to DQE

1. **Sticky re-observation** of the same `product_id` across days (P0-3).
2. **Niche/query churn** discovering new SKUs once instead of deepening known SKUs.
3. **Machine mint OFF** — even ready+VERIFIED candidates rarely become pending offers in prod (P0-1).
4. **ML-only marketplace** — non-ML deals have no PPS history (P2-2).

---

## 10. Classification answer (user question)

After ~3 days of continued operation on top of existing history:

**We are in A + B:** accumulating correctly, but insufficiently for majority DQE history paths. Not C/D/E. F only for the notReady majority.

**Percentage that can start benefiting when day-4 depth is reached for sticky SKUs:**  
Already **23.7%** of all products; **39.8%** of the last-3-day active cohort. Closing the 157 “one day away” set is the fastest near-term lift without changing the contract.

---

## 11. Query templates used

See `scripts/verify-price-memory-growth.ts` and Day 1 audit SQL (counts, daily, niche, depth, contract ready, quality). Re-run via MCP with `project_id=mkgsrpsuvedwwlzmzmzh` only for read-only census.
