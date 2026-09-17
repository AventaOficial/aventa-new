# ADR addendum — PriceObservation read bridge (P0.2)

**Status:** ACCEPTED  
**Date:** 2026-09-16  
**Parent:** [`ADR_price_memory_vs_observations.md`](./ADR_price_memory_vs_observations.md)

## Decision

PriceObservation is a **canonical READ representation** only.

```
offer_price_snapshots  → OfferPriceSnapshotMapper/Reader → PriceObservation
product_price_snapshots → PriceMemoryMapper/Reader        → PriceObservation
```

No writes back. No new table. `DEAL_INTELLIGENCE_ENABLED` stays OFF.

## Mapping matrix

### `offer_price_snapshots`

| Field | Mapping | Status |
|-------|---------|--------|
| `offer_id` | evidence `offer_id` (not product identity alone) | SUPPORTED |
| `price` | `salePrice` | SUPPORTED |
| `original_price` | `listPrice` | SUPPORTED (nullable) |
| `recorded_at` | `observedAt` | SUPPORTED |
| `source` | `captureMethod` (mapped enum) + evidence | DERIVED |
| currency | **absent in schema** → require `currencyHint` or mark invalid | UNKNOWN without hint |
| product identity | via optional `product_fingerprint` / URL from offers join | DERIVED when provided |
| seller / variant | absent | UNKNOWN |
| `effectivePrice` | always `null` (no stacking) | SUPPORTED (explicit null) |
| URL | optional; never required for map; redact in telemetry | UNKNOWN/optional |

### `product_price_snapshots` (Price Memory)

| Field | Mapping | Status |
|-------|---------|--------|
| `marketplace` | must be `mercadolibre`; merchant=`mercadolibre` | SUPPORTED |
| `product_id` | `mlItemId` + fingerprint `ml:{id}` → identity **exact** | SUPPORTED |
| `last_price` | `salePrice` | SUPPORTED |
| `list_price` | `listPrice` | SUPPORTED (nullable) |
| `regular_price` | evidence only (not sale/list) | DERIVED evidence |
| `currency` | `currency` | SUPPORTED |
| `recorded_at` | preferred `observedAt` | SUPPORTED |
| `recorded_on` | fallback date → `observedAt` noon UTC if no timestamptz | DERIVED |
| `min_price` | **not** copied as historical_low into observation | intentionally omitted |
| seller / variant / URL | absent | UNKNOWN |
| `effectivePrice` | always `null` | SUPPORTED (explicit null) |

## Information loss

- Offer snapshots: no native currency, seller, variant, ASIN/ML without join.
- Price Memory: daily grain (upsert), not tick-level; `min_price` is day ratchet ≠ DI historical_low claim.
- Neither source encodes coupons/bank stacking.

## Query complexity (bounded)

- Counts: `head:true` + marketplace/date filters (existing indexes).
- Samples: `ORDER BY recorded_at|recorded_on DESC LIMIT N` (N≤200).
- No full-table identity scans for CEO.
