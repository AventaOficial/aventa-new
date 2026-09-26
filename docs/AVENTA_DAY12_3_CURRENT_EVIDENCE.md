# AVENTA — DAY 12.3 Current Evidence / Original Price

**Status:** investigation + structural transport fix  
**Cycle audited:** `continuous-2026-09-26-12`  
**Does not change:** DQE, S6.1, artificial-list, PM history rules, mint/money

## ROOT CAUSE

After Day 12.2 (`identity_mismatch = 0`), the dominant provenance gap became
`missing_current_original` / `PROVENANCE_MISSING_CURRENT_EVIDENCE`.

For the four sticky_near_ready failures, live tip had **sale current** and
**null list/original today**. PM historical `list_price` is **not** allowed as
current original. In parallel, the title gate discarded priced observe meta when
title was the placeholder `Producto {id}`, so the cycle recorded
`acquisition_path=precomputed_only` and never transported live current/original
fields that observe already held.

Identity was already correct. The gate failed because **no mint-trusted current
original evidence** reached provenance — either absent at reachable live sources
(**A**) or dropped before diagnosis (**B** transport of current meta).

## CANDIDATE BREAKDOWN (`continuous-2026-09-26-12`)

| candidate | source | current evidence | original evidence | classification | provenance | terminal |
| --- | --- | --- | --- | --- | --- | --- |
| MLM2501022145 | sticky_near_ready / PM tip | /prices sale OK; meta dropped → `precomputed_only` | null live; PM list today null | **A** | `missing_current_original` | `PROVENANCE_FAILURE` |
| MLM2751763985 | sticky_near_ready / PM tip | same | same | **A** | `missing_current_original` | `PROVENANCE_FAILURE` |
| MLM6264861146 | sticky_near_ready / PM tip | same | same | **A** | `missing_current_original` | `PROVENANCE_FAILURE` |
| MLM2624476949 | sticky_near_ready / PM tip | same | same | **A** | `missing_current_original` | `PROVENANCE_FAILURE` |
| MLM2177969823 | discovery_evidence_fallback | listing_card / no live current provenance | stale path | **F** | `stale_or_absent_current` | stale terminal |

Primary class for the four is **A** (original not present on reachable live
sources for that tip). Secondary observability defect (**B**-shaped): priced
meta discarded → false `precomputed_only`. Fix addresses transport only.

## ADAPTER AUDIT

| Source | Fields | Role |
| --- | --- | --- |
| `/items/{id}/prices` | amount, regular_amount, standard/promotion | Primary current + optional original |
| `/items/{id}/sale_price` | amount, regular_amount | Fallback current |
| `/products/{catalog}/items` | price, original_price | Catalog→listing original recovery (Day 12); needs **catalog** product id |
| Listing card / census | card prices | Fallback evidence; not mint-trusted alone |
| PM snapshots `list_price` | prior-day captured list | **Memory only** — not current provenance |

No duplicate adapter added. products/items already recovers original when the tip
is a catalog PRODUCT and the listing returns `original_price`.

## PROVENANCE SEMANTICS (`originalPrice`)

| Concept | Allowed as mint `originalPrice`? |
| --- | --- |
| Live API list / regular / strikethrough with `source_explicit` | **Yes** (trusted tag) |
| `listing_card` alone | **No** |
| Habitual / median / historical PM `list_price` | **No** — history ≠ current original |
| MSRP guessed / invented | **No** |
| Other variant’s price | **No** |

**Gap (documented, not changed):** UI “tachado” vs API `regular_amount` vs PM
historical list can look similar to operators; mint trust remains
`source_explicit` from live acquisition only.

## FIX

**Implemented** (transport only; no invented originals):

1. Keep priced meta in `observeStickySkuViaServer` when API current > 0 even if
   title is thin (`Producto {id}` placeholder).
2. In `enrichCandidateMeta`, if observe returns null meta but live `obs.price`,
   transport current (+ original only when observe already has it) into cycle meta
   with `acquisition_path=sticky_observe`.
3. Durable diagnostics: `original_source` (= `original_recovered_via`),
   `original_price_provenance`, `identity_match_method`;
   `observability_schema_version` stays `1`.

## WHY

Evidence showed live current was observable but discarded, and originals were
not fabricated from PM. Transport restores honest sticky acquisition so
provenance can complete when products/items or /prices truly supply original,
and still fail honestly with `missing_current_original` when they do not.

## NEXT DECISION

Re-measure production after merge/deploy:

- Expect `acquisition_path=sticky_observe` and
  `original_recovered_via=unavailable|products_items|prices_endpoint`.
- If originals remain absent → bottleneck is **source exposure** (item-shaped
  tips without list on /prices; catalog path N/A) — not identity.
- Day 13 artificial still deferred until that measurement.
