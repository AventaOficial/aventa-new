# AVENTA — DAY 12.4 Sticky Path Selection

**Status:** investigation + observability-only change  
**Cycle audited:** `continuous-2026-09-26-13` (plus `…-10`, `…-11`, `…-12`)  
**Does not change:** routing, DQE, S6.1, provenance semantics, PM semantics, artificial rules, lease, sole writer, mint/money

## ROOT CAUSE

`precomputed_only` on `sticky_near_ready` is **not** "path not attempted".
Live observe **was attempted** for every PM-driven candidate
(`funnel.fetch_attempted = 8`, `fetch_success = 2`, `fetch_blocked = 6`).

The 5 `precomputed_only` rows are PM tips whose `product_id` is an **item id**
(10 digits, e.g. `MLM1649534433`). Read-only probe with a valid OAuth token:

| endpoint | item ids (×5) | catalog controls (`MLM63084226`, `MLM45749298`) |
| --- | --- | --- |
| `/items/{id}/prices` | 403 | 404 |
| `/items/{id}/sale_price` | 403 | 404 |
| `/items/{id}` | 403 | 404 |
| `/products/{id}/items` | 404 | **200** with `original_price` |
| `/products/{id}` | 404 | 200 |

`resolveMercadoLibrePrice` maps 401/403 on `/prices` to `unauthorized`;
`observeStickySkuViaServer` fails closed on `unauthorized` → `source_blocked`.
No discovery evidence exists for those ids, so meta stays the PM seed and the
path label keeps its initial value `precomputed_only`.

**Class: C — SOURCE/ADAPTER_UNAVAILABLE.** No existing adapter can read these
item ids (the codebase already notes `/items?ids=` is 403 too).

## PATH SELECTOR (exact)

`enrichCandidateMeta` in `lib/hunter/discovery/continuousDiscoveryCycle.ts`:

```ts
acquisitionPath = meta ? 'precomputed_only' : 'unknown';   // initial label
if (rawMetadata.priceMemoryDriven === true && productId) {
  obs = observeStickySkuViaServer(productId);
  if (obs.observationStatus === 'source_blocked') fetchBlocked = true;          // label unchanged
  else if (obs.meta)                               acquisitionPath = 'sticky_observe';
  else if (obs.price?.value > 0)                   acquisitionPath = 'sticky_observe'; // Day 12.3
  else                                             fetch_failed++;              // label unchanged
  if (!liveOk && evidenceMetaFor(productId))       acquisitionPath = 'discovery_evidence_fallback';
}
```

Inside `observeStickySkuViaServer`:

```ts
priceRes = resolveMercadoLibrePrice(id)   // /prices → /sale_price → catalog exact match
if (priceRes.resolved)                     quote (+ products/items if original missing)
else if (unauthorized || not_found)        return source_blocked | not_found   // fail-closed
else /* unavailable|error */               products/items fallback
```

So: catalog ids → `/prices` 404 → `unavailable` → products/items → `sticky_observe`.
Item ids → `/prices` 403 → `unauthorized` → `source_blocked` → `precomputed_only`.

## OBSERVE OUTCOME PER CANDIDATE (`…-13`)

| candidate | source | id shape | outcome | path |
| --- | --- | --- | --- | --- |
| MLM63084226 | pm_evidence_backed | catalog | ok (products_items) | sticky_observe |
| MLM45749298 | pm_evidence_backed | catalog | ok (products_items) | sticky_observe |
| MLM2177969823 | pm_evidence_backed | item | source_blocked → evidence | discovery_evidence_fallback |
| MLM1649534433 | sticky_near_ready | item | source_blocked (403) | precomputed_only |
| MLM2313849590 | sticky_near_ready | item | source_blocked (403) | precomputed_only |
| MLM3732634000 | sticky_near_ready | item | source_blocked (403) | precomputed_only |
| MLM4643947020 | sticky_near_ready | item | source_blocked (403) | precomputed_only |
| MLM3488179533 | sticky_near_ready | item | source_blocked (403) | precomputed_only |

Category (Day 12.4 vocabulary): **OBSERVE_ATTEMPTED_FAILED / SOURCE_NOT_SUPPORTED**
for all 5. Not deadline, not missing input, not selection bug.

## DEADLINE

`…-13`: `endedBy=normal`, `enrich_eval` used 3.7s of 45s; `hunter_collect` used its
full 75s cap. The enrich loop `break`s **before** `enrichCandidateMeta` when the
deadline hits, so deadline never produces `precomputed_only`.

## CORRECTION TO DAY 12.3

Day 12.3 attributed `…-12` failures to "/prices current OK but meta dropped by
title gate". Snapshot funnel for `…-12` shows `fetch_blocked=5` — those tips were
item ids blocked with 403, same as `…-13`. The Day 12.3 transport change is
harmless and covered by tests, but it did not address the production cause.

## Why `…-10` looked healthy

`…-10` had `sticky_history_ready` with **catalog** ids (8 digits) → 7× `sticky_observe`.
`…-11/12/13` sticky pools are dominated by **item** ids → blocked.

## CHANGE (observability only)

Durable `candidate_observations[]` fields (additive, `schema_version` stays 1):

| field | meaning |
| --- | --- |
| `observe_outcome` | `not_attempted` / `ok` / `insufficient_evidence` / `source_blocked` / `not_found` / `price_unverified` / `error` / `threw`; null when not PM-driven |
| `observe_reason` | adapter reason (`price_status:unauthorized`, `products_not_found`, …) |
| `observe_http_status` | HTTP status from the failing hop, when known |

`acquisition_path` vocabulary is unchanged for snapshot comparability.

## GAP (documented, not changed)

Blocked PM-seed rows carry `current_price_provenance=price_intel_derivation` from the
PM tip, so provenance reports `missing_current_original` instead of
`stale_or_absent_current`. Current price is not live either. Semantics unchanged.

## NEXT DECISION

Bottleneck is **source exposure for item-shaped PM tips**, not path selection.
Options to evaluate (not implemented):

1. Selection: prefer/limit sticky targets to ids reachable by an allowed adapter
   (catalog ids), measured by `observe_outcome`.
2. Source: obtain item→catalog mapping from an existing permitted source at
   ingest time (worker / listing card) so PM stores the catalog id.
3. Accept: item ids remain PM-only memory; never evaluated as live deals.
