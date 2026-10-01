# AVENTA — DAY 12.2 Sticky Reacquisition Identity Binding

**Status:** investigation + structural diagnosis fix  
**Does not change:** DQE, S6.1, artificial-list thresholds, PM history rules, mint/money

## ROOT CAUSE

Price Memory tips for sticky reacquisition are often **ML catalog product ids**
(`product_price_snapshots.product_id`).

Day 12 recovery calls `/products/{catalog}/items`, picks a **listing item**, and
rewrites `canonicalUrl` to that listing permalink.

Day 12 provenance diagnosis compared:

```
expectedProductId  = PM tip (PRODUCT / catalog)
extractItemId(url) = LISTING item on URL
```

Those are **different identity layers**. When they differ, diagnosis emitted
`identity_mismatch` / `PROVENANCE_IDENTITY_MISMATCH` even though the listing was
the deterministic API child of the catalog tip.

This is a **false identity mismatch**, not proof that the wrong product was
acquired.

## IDENTITY FLOW

```
product_price_snapshots.product_id          ← PRODUCT (catalog tip)
        │
        ▼
sticky_history_ready / sticky_near_ready
candidateFromProductId → URL often built as item-shaped permalink from tip
        │
        ▼
observeStickySkuViaServer(productId=tip)
  1) resolveMercadoLibrePrice(itemId=tip)     ← may treat tip as ITEM
  2) if sale-only / unavailable:
       GET /products/{tip}/items              ← tip as CATALOG
       pick listing with original when possible
       listingItemId + offerUrlHint(listing)
        │
        ▼
meta.canonicalUrl = listing permalink        ← LISTING
meta.signals.mlCatalogProductId = tip        ← PRODUCT
meta.signals.mlListingItemId = listing       ← LISTING
        │
        ▼
diagnoseProvenanceCompleteness(expected=tip, url=listing)
```

Existing architecture already separates layers:

- `resolveMercadoLibreItem`: `itemId` vs `catalogProductId`
- `identityHierarchy`: SOURCE_ITEM / LISTING / PRODUCT / VARIANT
- `OfferUrlResolveResult.productIdentity` / `variantIdentity`

Day 12.2 **reuses** that vocabulary; does not invent a parallel identity system.

## CURRENT CONTRACT

| Field | Layer | Source |
| --- | --- | --- |
| `mlCatalogProductId` | PRODUCT | PM tip / sticky observe input |
| `mlListingItemId` | LISTING | `/products/{catalog}/items` `item_id` (or tip when tip is the item) |
| `canonicalUrl` | LISTING permalink | `offerUrlHint` / resolved URL |
| `mlIdentityMatchMethod` | bind method | see below |

### `mlIdentityMatchMethod`

| Method | Meaning |
| --- | --- |
| `exact_item_id` | tip id == URL item id |
| `exact_catalog_id` | tip/catalog permalink identity (reserved) |
| `catalog_to_listing_via_products_items` | tip catalog fetched products/items; returned listing == URL item |

**Match rules (fail-closed):**

1. tip == URL item → match  
2. else if listing from products/items == URL item **and** catalog tip == expected tip → match  
3. else → `identity_mismatch` (no invented maps, no “similar product”)

Provenance **complete** still requires trusted current+original evidence.
Fixing identity bind alone never upgrades trust from PM history.

## FAILURE REPRODUCTION (fixtures)

See `tests/hunter/discovery/day12_2IdentityBinding.test.ts`:

| Case | Setup | Expected |
| --- | --- | --- |
| A | tip == listing | exact match |
| B | tip catalog ≠ listing + API listing signal | match via products_items |
| C | URL listing ≠ acquired listing | mismatch |
| D | tip ≠ URL, no listing signal | mismatch |
| E | conflicting listing ids | mismatch |

## WHAT WE DID NOT DO

- Did not ignore `identity_mismatch`
- Did not force `provenance.complete=true` from tip alone
- Did not change artificial-list / DQE / S6.1 / mint / money
- Did not change `ML_PRICE_MIN_HISTORY_DAYS`

## NEXT

Production observation should show fewer false `PROVENANCE_IDENTITY_MISMATCH`
on sticky products/items recoveries. `INSUFFICIENT_HISTORY` and
`ARTIFICIAL_LIST_PRICE` remain separate bottlenecks.
