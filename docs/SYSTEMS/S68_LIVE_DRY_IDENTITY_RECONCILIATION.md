# S6.8 — Live ↔ Dry Identity Reconciliation

## 1. Root cause

**Architectural divergence**, not a SKU-specific bug.

| Path | Identity check |
|---|---|
| Dry (`normalizeMlWorkerListing`) | `itemId` **OR** `/up/MLMU` user-product id |
| Fingerprint (`offerUrlFingerprint`) | same (item then user-product) |
| Live (`toParsedMeta`) | **only** `extractMercadoLibreItemId` |

Candidate `MLMU3097285590` (`/up/MLMU…`) passed dry/gate but live returned `null` → `worker payload inválido`.

## 2. Identity flow

```
worker discovery URL
  → ExternalWorkerCandidate
  → resolveMercadoLibreListingExternalId  ← SINGLE AUTHORITY
       1. extractMercadoLibreItemId (MLM… / catalog)
       2. extractMercadoLibreUserProductId (/up/MLMU…)
  → canonicalUrl + externalId
  → fingerprint ml:{EXTERNAL_ID}
  → sourceEventId ml_worker:ml:{EXTERNAL_ID}
  → gate S6.1 / live eligibility
  → insertIngestedOffer UNIQUE(product_fingerprint)
```

## 3. Canonical identity

**Authority:** `resolveMercadoLibreListingExternalId` in `lib/offers/resolveMercadoLibreItem.ts`

Reused by:

- dry adapter (`mlWorkerListingAdapter`)
- live `toParsedMeta` via `hasMercadoLibreListingIdentity`
- `resolveIdentityFromUrl` (DealIdentity)
- same precedence as `offerUrlFingerprint`

No `extractIdForDryRun` / `extractIdForLive`.

## 4. Before / after

| STAGE | DRY (before) | LIVE (before) | SAME? |
|---|---|---|---|
| external id `/up/MLMU` | MLMU3097285590 | **null** (reject) | **NO** |
| fingerprint | ml:MLMU… | n/a | NO |
| gate | VERIFIED | never reached | NO |

| STAGE | DRY (after) | LIVE (after) | SAME? |
|---|---|---|---|
| external id | MLMU3097285590 | MLMU3097285590 | YES |
| fingerprint | ml:MLMU3097285590 | ml:MLMU3097285590 | YES |
| sourceEventId | ml_worker:ml:MLMU… | ml_worker:ml:MLMU… | YES |
| qualityDecision | VERIFIED_OPPORTUNITY | VERIFIED_OPPORTUNITY | YES |
| wouldInsert / eligible | true | true | YES |

Pool reconcile: **15/15 equivalent**, **0 divergences**.

## 5. Security implications

- Host allowlist unchanged (`isOfferMercadoLibreHost`)
- `/gz/`, login, account-verification still blocked
- No arbitrary URL acceptance
- Only identities already recognized by fingerprint

## 6. Dry/live comparison

Reconcile report: `scripts/_s68_reports/s68-report-latest.json`

- equivalent: 15
- divergences: 0
- selectable (non-dup, VERIFIED): 3 including `MLMU3097285590`

## 7. Canary results

`--execute --cap=3` after 100% reconcile:

| Offer | Fingerprint | URL shape |
|---|---|---|
| `b0efafbc-…` | `ml:MLMU3097285590` | `/up/MLMU` (S6.7 divergence fixed) |
| `4c2e82af-…` | `ml:MLMU488803900` | `/up/MLMU` |
| `6a0304a5-…` | `ml:MLM53177027` | `/p/MLM` |

All `status=pending`. Flag after: **OFF**.

## 8. Idempotency

Retry `MLMU3097285590` → `duplicate` / `pending_fresh`; `secondInsert: false`.

## 9. Focus claimability

`preferOfferId` claim → claimed; fingerprint `ml:MLMU3097285590`; `bot_meta` present; released. No Focus/CAS changes.

## 10. Write audit

| Surface | Δ |
|---|---|
| offers pending | **+3** (= inserts) |
| distribution_publications | **0** |

## 11. Tests

- `tests/bots/ingest/liveDryIdentity.s68.test.ts` (10)
- Regression S2–S6.7 + S6.8: **155 passed**

## 12. Risks

- Price Intel may still annotate artificial list price post-gate (advisory; unchanged policy).
- Staging canary author remains seed user (no dedicated bot UUID).

## 13. Blockers

None for identity equivalence.

## 14. Exact next step

Human review of S6.7+S6.8 pending canary offers in Focus; then decide S6.9 (staging bot author / ops) **before** Distribution C2.

---

Files:

- `lib/offers/resolveMercadoLibreItem.ts` — shared authority
- `lib/bots/ingest/externalWorker.ts` — live uses shared identity
- `lib/supplyIntelligence/adapters/mlWorkerListingAdapter.ts` — dry uses shared authority
- `lib/dealIntelligence/identity.ts` — resolveIdentityFromUrl uses shared authority
- `scripts/s68-live-dry-identity-reconcile.ts`
- `docs/SYSTEMS/S68_LIVE_DRY_IDENTITY_RECONCILIATION.md`
