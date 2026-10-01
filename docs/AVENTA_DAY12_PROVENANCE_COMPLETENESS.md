# AVENTA — DAY 12 Provenance Completeness

## Root cause (production Day 11)

`sticky_history_ready` rediscovers by PM product tip (sale-only seed).
Live `observeStickySkuViaServer` often resolved **current price** from `/prices`
**without** an API original, and previously **did not fall through** to
`/products/{id}/items` which can carry a real `original_price`.

S6.1 correctly emitted `INVALID_ORIGINAL_PRICE` / `ORIGINAL_PRICE_UNTRUSTED`
→ terminal `PROVENANCE_FAILURE`.

Price Memory historyReady ≠ provenance. Day 12 does **not** bypass that.

## Fix

1. When prices resolve sale-only → attempt **products/items** recovery for a
   real listing original (existing adapter; no invented prices).
2. If recovery fails → provenance still fails (honest).
3. Structured diagnosis (`PROVENANCE_MISSING_CURRENT_EVIDENCE`, etc.) appended
   to reason codes without a parallel gate taxonomy.

## Invariants

- DQE / S6.1 / sole writer / lease / mint / money unchanged
- `ML_PRICE_MIN_HISTORY_DAYS = 4` unchanged
- No fabricated timestamps / history / originals
