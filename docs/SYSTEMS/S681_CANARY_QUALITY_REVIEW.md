# S6.8.1 — Canary Quality Review + Supply Checkpoint

**Mode:** read-only review (no inserts, machine writes unset, no architecture changes)  
**Staging ref:** `oojshofrpbfwsiypcecr`  
**Evidence:** `scripts/_s681_reports/s681-report-latest.json`  
**Generated:** 2026-09-18

---

## 1. Canary inventory

All 5 offers resolved by **offer_id + product_fingerprint**. None missing.

| Wave | offer_id | external_id | fingerprint | status | sale | original | disc% | created_at |
|---|---|---|---|---|---|---|---|---|
| S6.7 | `e29c4f66-7dc4-4658-9620-63efc78775f7` | MLM48434598 | `ml:MLM48434598` | pending | 698.18 | 2492 | 72 | S6.7 canary |
| S6.7 | `c7ba9c00-fb7b-4b8a-b655-4609f992b129` | MLM51558214 | `ml:MLM51558214` | pending | 3294.6 | 10198 | 68 | S6.7 canary |
| S6.8 | `b0efafbc-444c-4c33-8e9b-ef67924b706e` | MLMU3097285590 | `ml:MLMU3097285590` | pending | 298.9 | 1044 | 71 | S6.8 canary |
| S6.8 | `4c2e82af-0e8f-4efa-b38f-a293e7066dea` | MLMU488803900 | `ml:MLMU488803900` | pending | 54 | 135 | 60 | S6.8 canary |
| S6.8 | `6a0304a5-6194-4484-9090-62b636c660f2` | MLM53177027 | `ml:MLM53177027` | pending | 869.51 | 2299 | 62 | S6.8 canary |

Common fields (all 5):

- store: Mercado Libre  
- `originalPriceProvenance`: **listing_card**  
- `cardDiscountSource`: **card_strikethrough**  
- `gateAction`: **insert_pending**  
- `bot_meta`: present  
- `image_url`: HTTPS present  
- `sourceEventId`: present in `bot_meta.rawObservation` (run-scoped prefix + ml_worker URL)

---

## 2. Quality review

Checklist (14 points) — **5/5 quality_pass**, **0 hard issues**.

| Check | Result |
|---|---|
| Product identifiable | PASS (MLM / MLMU fingerprint) |
| Title reasonable | PASS |
| URL correct | PASS |
| Marketplace | PASS (Mercado Libre) |
| salePrice | PASS |
| originalPrice + provenance | PASS (`listing_card`) |
| discount coherent | PASS (60–72%) |
| cardDiscountSource | PASS (`card_strikethrough`) |
| imageUrl present/valid | PASS |
| fingerprint | PASS (`ml:…`) |
| bot_meta coherent | PASS |
| status pending | PASS |

### Machine vs human semantics

| Question | Answer |
|---|---|
| ¿S6.1 los consideró VERIFIED_OPPORTUNITY? | **Sí** — insertaron con `gateAction=insert_pending` / `passed_machine_quality_gates` |
| ¿Un moderador humano puede evaluarlos? | **Sí** — pending, claimable, con precios/URL/imagen/bot_meta |
| ¿Señal claramente incorrecta (hard)? | **No** |

### Advisory classifications (NOT gate failures)

Observed on **3/5** offers (both S6.7 + `MLM53177027`):

| Classification | Meaning |
|---|---|
| `expected_advisory_limitation:suspected_artificial_list_price` | Price Intel sospecha lista artificial |
| `expected_advisory_limitation:dealscore_zero_no_history` | DealScore advisory = 0 (sin historial) |
| `expected_advisory_limitation:dqe_no_verified_deal_vs_s61_verified` | DQE `NO_VERIFIED_DEAL` / DISCARD **≠** S6.1 VERIFIED (by design: DQE observational) |
| `scoring_issue:effective_discount_zeroed_by_price_intel` | `effectiveDiscountPercent=0` post Price Intel while label discount remains high |

**2/5** (`MLMU3097285590`, `MLMU488803900`): DQE `POTENTIAL_DEAL`, DealScore 15, verifier 61–65 — cleaner advisory profile.

**No silent gate change.** These are expected Option A / advisory-layer tensions for human Focus review.

### imageProvenance note

`bot_meta.signals.imageProvenance` is **null** on all 5 rows, while HTTPS `image_url` is present.  
Classified as **meta persistence gap** (live path does not always mirror dry adapter’s `imageProvenance` into stored signals) — **not** an invalid image. Images themselves are valid.

---

## 3. Provenance validation

| Field | Value | OK |
|---|---|---|
| originalPriceProvenance | listing_card (5/5) | YES |
| cardDiscountSource | card_strikethrough (5/5) | YES |
| Trusted for S6.1 | YES | — |

---

## 4. Image validation

| Field | Value | OK |
|---|---|---|
| image_url HTTPS | 5/5 | YES |
| imageProvenance in bot_meta | null (5/5) | GAP (meta only) |

---

## 5. Focus validation

Claim+release probe (preferOfferId) — **5/5 claimable**, all `claimKind=fresh`, all released.

No CAS/lease/heartbeat code changes.

---

## 6. Write audit

| Claim | Evidence |
|---|---|
| offers canary = 5 pending | Confirmed present by id+fingerprint |
| Historical Δ +5 | S6.7 report Δpending=+2; S6.8 report Δpending=+3 (cannot re-freeze baseline; **not invented**) |
| Distribution Δ from canaries = 0 | S6.7/S6.8 reports: dist Δ=0; current pub/event counts unchanged relative to those audits |
| Rewards / Economy / Attribution | Tables queryable; **no evidence of canary writes**; count fields null/empty — **cannot prove absolute zero historical events outside canary window** |

**Honest limit:** without a frozen pre-canary snapshot at review time, lateral systems are “no growth attributed to canary in contemporaneous reports,” not a cryptographic global zero.

Machine writes env at review: **(unset) / OFF**.

---

## 7. Supply checkpoint

| Phase | Status | Note |
|---|---|---|
| S2 RawObservation | **VALIDATED** | Provenance slice in bot_meta; identity exact |
| S3 DealScore → Focus priority | **VALIDATED** | Advisory present; Focus priority path exists (not re-tuned here) |
| S4 SourceAdapter | **VALIDATED** | Dry-run 15/15; live identity aligned S6.8 |
| S5.5 real worker dry-run | **VALIDATED** | Fixture discovery used for canaries |
| S6.1 machine quality gate | **VALIDATED** | Sole quality authority live (S6.6+) |
| S6.2 provenance | **VALIDATED** | listing_card preserved on all 5 |
| S6.3 image extraction | **VALIDATED** | Images present; imageProvenance meta **PARTIAL** in stored bot_meta |
| S6.4 worker_card empirical | **COMPLETE** | Empirical report; no scorer change |
| S6.5 insert policy | **COMPLETE** | Spec; superseded as live authority by S6.6 |
| S6.6 live gate unification | **VALIDATED** | Live uses S6.1 |
| S6.7 canary | **VALIDATED** | 2 pending; 1 divergence fixed in S6.8 |
| S6.8 identity reconciliation | **VALIDATED** | 15/15 + 3 inserts incl. prior divergent MLMU |
| S6.8.1 quality review | **COMPLETE** | This document |

**Supply machine path (SOURCE → identity → gate → pending → Focus) is sufficiently validated for the next architectural boundary.**

---

## 8. Remaining risks

1. DQE/`Price Intel` advisory conflict with S6.1 VERIFIED (human must resolve in Focus).  
2. `imageProvenance` not always persisted in live `bot_meta.signals`.  
3. Staging canary author = seed user (not dedicated bot UUID).  
4. Artificial list-price suspicion on high-discount cards without history.

---

## 9. Remaining blockers

**None** blocking Supply checkpoint close for machine→pending→Focus.

Precondition gaps for **Distribution C2** (not implemented here):

- Distribution must consume **approved/published**, not pending  
- Human moderation outcomes on canary set not yet completed  
- No auto-publish / Telegram from Supply

---

## 10. Next architectural boundary

**Distribution C2** — only after:

1. Explicit human Focus decisions on canary pendings (approve/reject sample)  
2. Confirmation Distribution enqueue remains gated on approved≠pending  
3. Separate Distribution readiness checklist (out of Supply scope)

**Do not open S6.9 by inertia.** Supply machine insert loop is closed at checkpoint.

---

Artifacts:

- `scripts/s681-canary-quality-review.ts`  
- `scripts/_s681_reports/s681-report-latest.json`
