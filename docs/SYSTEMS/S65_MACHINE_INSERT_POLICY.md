# S6.5 — Machine Insert Policy / Production Readiness Specification

**Status:** SPECIFICATION ONLY — not implemented as live insert authority  
**Date:** 2026-09-18  
**Precedencia:** S6.1–S6.4 closed empirics + ADR Option A (`offers.pending` = canonical candidate)  
**Non-goals:** activating writes, changing scorer/verifier/gate weights, new tables/queues, Distribution/Rewards/Economy/Attribution

---

## 0. Critical contradiction (STOP — do not silent-fix)

### Observation

| Path | Authority for “may become pending” |
|------|--------------------------------------|
| **Dry-run / S4–S6 diagnostics** | `evaluateMachineCandidateGate` (S6.1) — trusted provenance required; `wouldInsert` only for `VERIFIED_OPPORTUNITY` |
| **Live machine insert today** | `processExternalWorkerBatch` / `runIngestCycle` → inline checks + `evaluateDealSafe` + **`mlWorkerMayInsertPending` (DQE)** → `insertIngestedOffer` |

**Live does not call `evaluateMachineCandidateGate`.**

### Implication

- S6.1–S6.4 empirics (`WOULD_INSERT`) measure the **policy we intend**.
- Production insert today measures a **different** gate (`mlWorkerMayInsertPending`), which can allow weak listing / QE-rescued paths that S6.1 would suppress (e.g. badge paths rescued by DQE).

### Policy decision for production readiness

**Before any real machine insert canary:**

1. Live insert path MUST evaluate `evaluateMachineCandidateGate` and require `wouldInsert === true`.
2. `mlWorkerMayInsertPending` may remain as an **additional** fail-closed layer, never as a bypass of S6.1.
3. Until (1) is implemented, **production machine writes remain FORBIDDEN**.

This document does **not** implement that wiring. It records the blocker.

---

## 1. Current insert path

```text
Worker Playwright (READ discovery)
  → ExternalWorkerCandidate
  → POST /api/cron/bot-ingest-candidates   [LIVE — gated by cron secret]
      → processExternalWorkerBatch
          → toParsedMeta (+ preserveMachinePriceProvenance)
          → enrich / DQE / evaluateDealSafe
          → mlWorkerMayInsertPending          [LIVE gate — ≠ S6.1]
          → selectTopKByScore
          → insertIngestedOffer               [WRITE offers]
          → persistIngestSupplyRuns / shadow

Parallel (NO write):
  ExternalWorkerCandidate
    → normalizeMlWorkerListing
    → normalizedListingToRawObservation
    → scoreIngestCandidate + computeDealScore
    → evaluateMachineCandidateGate           [S6.1 — WOULD_INSERT]
    → dry-run report only
```

| Transition | Function | Write? |
|------------|----------|--------|
| Candidate → ParsedOfferMetadata | `toParsedMeta` / `normalizeMlWorkerListing` | No |
| → RawObservation (logical) | `buildRawObservation` / `normalizedListingToRawObservation` | No (slice → bot_meta later) |
| → Verifier | `scoreIngestCandidate` / `evaluateDealSafe` | No |
| → DealScore | `computeDealScore` | No (advisory) |
| → Quality gate (intended) | `evaluateMachineCandidateGate` | No |
| → Quality gate (live today) | `mlWorkerMayInsertPending` | No |
| → DB row | `insertIngestedOffer` | **YES — `offers`** |
| → Supply telemetry | `persistIngestSupplyRuns` | YES — `hunter_supply_runs` |
| → Shadow | `recordShadowOutcomeFromAutonomous` | YES — shadow tables |

**Canonical candidate entity:** `offers` with `status = 'pending'` (ADR Option A). No `deal_candidates` table.

---

## 2. Field eligibility matrix

| Field | Class | Reason |
|-------|-------|--------|
| URL (http/https) | **REQUIRED / BLOCKING** | Identity + outbound; invalid → INVALID |
| Host allowlisted (ML/Amazon/affiliate) | **REQUIRED / BLOCKING** | Security surface |
| Product identity (`amz:`/`ml:` fingerprint) | **REQUIRED / BLOCKING** | Dedupe UNIQUE + Focus work item |
| Title (non-empty, not low-quality) | **REQUIRED / BLOCKING** | Moderation usability |
| Merchant / store | **REQUIRED** | Display + routing |
| Sale price (`discountPrice` > 0) | **REQUIRED / BLOCKING** | Economic integrity |
| Original / reference price | **REQUIRED / BLOCKING** (machine) | S6.1 requireOriginalPrice |
| Currency | **OPTIONAL** (default MXN in RawObs) | Price Memory; not gate today |
| Discount % ≥ `minDiscountPercent` | **REQUIRED / BLOCKING** | Existing ingest policy |
| `originalPriceProvenance` ∈ {`listing_card`,`source_explicit`} | **REQUIRED / BLOCKING** (S6.1) | Trusted economic evidence |
| `cardDiscountSource` ≠ `badge_reconstructed` | **REQUIRED / BLOCKING** | Badge-only untrusted |
| Image URL | **OPTIONAL** (warning `PARTIAL_NO_IMAGE`) | S6.3 preferred; not WOULD_INSERT blocker |
| `imageProvenance` | **ADVISORY** | Distinct from price provenance |
| PDP blocked | **ADVISORY** (`PARTIAL_PDP_BLOCKED`) | No security bypass |
| Price history | **ADVISORY** (`PARTIAL_NO_HISTORY`) | DealScore/history; not gate blocker |
| DealScore | **ADVISORY** | Never publishes / never sole blocker |
| Verifier (`scoreIngestCandidate`) | **BLOCKING** if `reject` | Operational quality floor |
| Duplicate state | **BLOCKING** | No second active fingerprint |
| `sourceEventId` / RawObservation ids | **REQUIRED for audit** | Provenance replay; live ids today are run-scoped (weakness) |
| `listingTypeId=worker_card` | **ADVISORY heuristic** | ~+5 verifier pts; not provenance |

---

## 3. Quality state matrix (S6.1)

Formal states (no new states invented):

| State | Conditions (deterministic) | `wouldInsert` |
|-------|----------------------------|---------------|
| **INVALID** | Bad URL; host not allowed | false |
| **SUPPRESSED** | Missing meta/identity/sale; badge_reconstructed; untrusted/missing original provenance; original ≤ sale; discount below min; low-quality title; verifier reject | false |
| **DUPLICATE** | `findDuplicateOffer` / duplicate input after validity | false |
| **PARTIAL_EVIDENCE** | Type exists; gate **does not currently return** this as `qualityDecision`. Partial codes attach to VERIFIED as warnings. Dry-run may label status PARTIAL if `!wouldInsert` after other paths | false |
| **VERIFIED_OPPORTUNITY** | All hard checks pass + trusted provenance + verifier not reject + not duplicate | **true** |

---

## 4. WOULD_INSERT definition

```text
WOULD_INSERT ⇔ qualityDecision === 'VERIFIED_OPPORTUNITY'
            ⇔ evaluateMachineCandidateGate(...).wouldInsert === true
```

**Blockers (any → false):**

1. Invalid URL / host  
2. Missing product fingerprint  
3. Missing/invalid sale price  
4. Badge-reconstructed card evidence  
5. Missing/invalid original price (machine requireOriginal)  
6. Untrusted `originalPriceProvenance` (not listing_card / source_explicit)  
7. Discount below config min  
8. Low-quality title  
9. Verifier `reject`  
10. Duplicate  

**Non-blockers (warnings only when verified):**

- Missing image → `PARTIAL_NO_IMAGE`  
- No history → `PARTIAL_NO_HISTORY`  
- PDP blocked → `PARTIAL_PDP_BLOCKED`  
- Low DealScore  
- `worker_card` heuristic presence  

---

## 5. Production insert contract (conceptual)

**Name:** `MachineCandidateInsertContract` (documentation only — no new table).

**Preconditions (all must hold):**

1. `evaluateMachineCandidateGate.wouldInsert === true`  
2. `legacyAutoApproveWriteEnabled === false` in production → status **pending** only  
3. `DISTRIBUTION_ENGINE_ENABLED` not required and must not be flipped by insert  
4. Bot author user id resolved  
5. Duplicate check null (or expired slot released safely)  
6. Insert budget remaining: `min(slotsDaily, max(organicCap, workerMaxPerRun))`  
7. Source is machine path (`ml_worker` / approved ingest sources) — never client-trusted provenance  

**Effects (allowed):**

- INSERT `offers` row: `status='pending'`, fingerprint, prices, image, `bot_meta` (signals + RawObservation slice + DealScore advisory + gateAction)  
- Telemetry: supply runs / shadow (non-publish)  

**Effects (forbidden):**

- `status='approved'|'published'`  
- Distribution enqueue  
- Rewards / Economy / Attribution mutations  
- UGC reputation auto-approve paths  

**Canonical storage:** `offers.pending` (Option A).

---

## 6. Idempotency

| Layer | Key | Behavior |
|-------|-----|----------|
| Product | `product_fingerprint` UNIQUE partial (active pending/approved/published) | Second insert → duplicate / TOCTOU retry |
| URL | `findDuplicateOfferByUrl` | Soft pre-check |
| Observation (logical) | `ro:{hash(... minute bucket ...)}` | Replay collapse within minute — **not persisted as table** |
| Source event (adapter) | `ml_worker:ml:{ITEM}` | Stable across dry-runs |
| Source event (live today) | `{supplyRunId}:{source}:{url}` | **Run-scoped** — does not collapse cross-run replays by itself |

**Same event 1× / 2× / 100×:**

- Same fingerprint still active → no second pending row (UNIQUE + duplicate classify).  
- Weakness: live `sourceEventId` uniqueness is per-run; **product UNIQUE is the real write idempotency**. Documented — not patched here.

---

## 7. Concurrency

Workers A & B same product:

1. Both pass pre-checks (TOCTOU window).  
2. A INSERT succeeds.  
3. B hits UNIQUE → classified duplicate / optional `releaseExpiredFingerprintSlot` only if expired.  

**Lock:** `acquireIngestCycleLock('ingest:ml_worker')` serializes **external batch cycles** (fail-open if lock backend missing). `runIngestCycle` has no cycle lock.

**Race residual:** two processes without cycle lock + same fingerprint → UNIQUE still arbiter. No new lock in S6.5.

---

## 8. Retry semantics

| Failure | Class |
|---------|--------|
| Normalization / gate suppress | SAFE TO RETRY later (no write) |
| Duplicate | Do not retry insert (investigation if unexpected) |
| DB UNIQUE after check | SAFE TO RETRY as duplicate handling (already coded) |
| DB transient network | SAFE TO RETRY with backoff |
| Insert succeeded, process dies before telemetry | SAFE TO RETRY telemetry; offer already exists — duplicate on re-insert |
| Unknown partial write | REQUIRES INVESTIGATION |

No new retry subsystem in S6.5.

---

## 9. Failure isolation

- Live batch: per-item `try/catch` → `status: 'error'` on item; batch continues.  
- Dry-run: item-level FAILED/SUPPRESSED without aborting report.  
- Batch-level abort only: lock acquisition hard fail paths / config disabled / empty auth.

---

## 10. Volume policy

| Scale | Discovery | Evaluate | Insert | Moderation |
|-------|-----------|----------|--------|------------|
| 10 | OK | OK | Budget-capped | OK |
| 100 | OK | `candidatePoolMax` slice | `workerMaxPerRun` / daily | Pending pile grows |
| 1k–10k | Worker time / PDP budget | CPU in-process | **Budget + UNIQUE** | **Bottleneck** |
| 100k | Not supported without infra | — | — | — |

**True bottlenecks (existing):**

1. Human Focus / claim capacity  
2. `offers.pending` pile + `PENDING_STALE_AFTER_HOURS = 72`  
3. Daily bot cap `dailyMaxOffers` (default 120)  
4. Per-run `workerMaxPerRun` (default 10)  

No new queue. No invented infra.

---

## 11. Moderation capacity

Preserved unchanged: Focus, claim CAS, lease, heartbeat, SLA docs.

**Quantitative machine insert rate:** **UNKNOWN** from code alone — depends on moderator headcount and session throughput (not measured in S6.4).  

**Conservative production recommendation (policy, not implemented):**

- Canary: 1–5 inserts / day  
- Early production: ≤ `workerMaxPerRun` per enabled run and ≤ fraction of `dailyMaxOffers` reserved for machine (e.g. 10–20%) until Focus metrics exist  

Do not invent headcount.

---

## 12. UGC isolation

`POST /api/offers` (`app/api/offers/route.ts`):

- Community / user path  
- Does **not** call `evaluateMachineCandidateGate`  
- Does **not** accept client `bot_meta` as machine trusted provenance  
- Remains independent of this policy  

---

## 13. Security boundary

| UNTRUSTED INPUT | SERVER-DERIVED EVIDENCE |
|-----------------|-------------------------|
| Client body provenance / DealScore / verifier | Worker → `preserveMachinePriceProvenance` on machine path only |
| Client `bot_meta` | Built in `buildBotMeta` at insert time from server meta |
| Forged `listing_card` from browser | Must not be accepted outside machine ingest |

**Rule:** Trusted price provenance originates only from machine ingest path (worker/adapter), never from UGC client fields.

---

## 14. Write surface audit

| Surface | Machine path today | Allowed under S6.5 insert policy |
|---------|--------------------|-----------------------------------|
| `offers` pending | YES (`insertIngestedOffer`) | YES if contract met |
| `offers` approved | Only if legacy flag (OFF in prod) | **NO** |
| `hunter_supply_runs` | YES | YES (telemetry) |
| Shadow tables | YES | YES (telemetry) |
| `ingest_cycle_locks` | YES | YES |
| Moderation claim tables | NO on insert | NO |
| Distribution | NO | **NO** |
| Rewards / Economy / Attribution | NO | **NO** |

---

## 15. Observability requirements (minimum)

Emit/log (structured, no secrets/HTML):

1. `machine_candidate_discovered`  
2. `machine_candidate_normalized` / `normalize_failed`  
3. `machine_gate_suppressed` (+ reasonCodes)  
4. `machine_gate_duplicate`  
5. `machine_would_insert` (dry-run)  
6. `machine_insert_attempt` / `machine_insert_ok` / `machine_insert_failed`  
7. `machine_provenance_failure`  
8. `machine_verifier_reject`  

Reuse existing skip reason maps where possible. No analytics platform.

---

## 16. Canary design (DO NOT EXECUTE)

| Item | Spec |
|------|------|
| Size | 1–5 candidates |
| Selection | `wouldInsert` under S6.1; prefer image present; exclude badge; listing_card or source_explicit |
| Preconditions | Live path wired to S6.1; Distribution OFF; legacy auto-approve OFF; cron secret only |
| Success | Rows pending; Focus can claim; no duplicate storms; no approved/published; no Distribution |
| Failure | Unexpected approved; duplicate flood; provenance unknown inserted; moderation backlog spike |
| Window | 24–72h human review of canary rows |
| Rollback | See §17 — mark/reject pending; do not DELETE as primary |

---

## 17. Rollback semantics

**Do not assume DELETE.**

For canary / bad machine pending:

1. Moderator **reject** (or expire) via existing Focus tools  
2. Fingerprint slot frees per existing expire/stale rules  
3. Optional: stop machine cron / set insert budget 0  

Hard DELETE is out of policy for normal rollback.

---

## 18. Distribution boundary

```text
insert pending  ≠  publish
                ≠  distribution
                ≠  reward
                ≠  economy
                ≠  attribution
```

Machine insert must not enqueue Distribution or activate Rewards/Economy/Attribution.

---

## 19. Migration

**NONE.** No DDL, no backfill, no new tables, no `deal_candidates`.

---

## 20. Implementation checklist (future — not S6.5)

When implementing real insert (post-S6.5):

- [ ] Call `evaluateMachineCandidateGate` in live path before `insertIngestedOffer`  
- [ ] Require `wouldInsert`  
- [ ] Keep DQE/`mlWorkerMayInsertPending` as optional extra fail-closed, not bypass  
- [ ] Prefer stable `sourceEventId` (adapter style) in live RawObservation slice  
- [ ] Canary 1–5 only  
- [ ] Observability events above  

---

## 21. References

- `lib/bots/ingest/candidateInsertGate.ts` — S6.1  
- `lib/bots/ingest/insertIngestedOffer.ts` — write  
- `lib/bots/ingest/externalWorker.ts` — live batch  
- `lib/bots/ingest/mlWorkerPendingGate.ts` — live DQE gate (≠ S6.1)  
- `lib/offers/findDuplicateOffer.ts` — fingerprint / stale 72h  
- `docs/SYSTEMS/ADR_supply_candidate_boundary.md` — Option A  
- S6.4 empirics: worker_card ≈ +5 verifier; DealScore advisory ~15 without history  

---

**End of S6.5 specification. No production writes authorized by this document alone.**
