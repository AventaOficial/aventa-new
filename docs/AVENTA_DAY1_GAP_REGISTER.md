# AVENTA — Day 1 Gap Register

**Date:** 2026-09-24  
**Evidence base:** code audit on `039874b` + read-only Supabase MCP on prod `mkgsrpsuvedwwlzmzmzh`  
**Rule:** no cosmetic tasks; only gaps that block the Aventa machine.

Severity:

- **P0** — blocks the machine
- **P1** — required for complete product
- **P2** — required for scale
- **P3** — future optimization

---

## P0

### P0-1 — Machine path does not mint pending in production

| | |
|--|--|
| **Problem** | Machine opportunity flow stops before pending. `BOT_INGEST_MACHINE_PENDING_WRITES` default OFF; `machineWriteAuth` blocks production mint; cron `bot-ingest` is discovery-only (S9.1). |
| **Evidence** | `machineLiveInsertEligibility.ts`, `machineWriteAuth.ts`, `runIngestCycle.ts` S9.1 skip; prod `offers` pending = **0**. |
| **Impact** | Hunter/DQE can evaluate but cannot feed moderation queue from the machine. Automation of Hunter→pending ≈ 0% in prod. |
| **Dependency** | Staging write canaries; S6.1 already enforced on reconcile branch. |
| **Architectural solution** | Controlled staging mint → measured canary → explicit production policy for pending-only writes (never auto-approve). |
| **Done when** | Staging produces pending via sole writer with S6.1; prod policy documented; pending queue non-zero under canary without money flags. |

### P0-2 — `offer_observations` evidence lane is empty in production

| | |
|--|--|
| **Problem** | Observation table exists but has **0** rows while 766 offers exist. Append-only evidence SoT is not operating in prod. |
| **Evidence** | MCP: `offer_observations_count = 0`; schema present; sole writer code writes observations. |
| **Impact** | No audit trail for identity/price evidence; idempotency/replay forensics blind; Day 1 “Observation” stage PARTIAL. |
| **Dependency** | Deploy path that uses `ingestOfferObservation`; community/machine create must hit observation insert. |
| **Architectural solution** | Verify prod deploy includes sole writer observation path; backfill policy for new writes only (no destructive rewrite of history). |
| **Done when** | New community or staging machine creates yield `offer_observations` rows; monitoring alert if insert offer without observation. |

### P0-3 — Price Memory sticky continuity insufficient for DQE majority

| | |
|--|--|
| **Problem** | History accumulates, but most products lack ≥4 prior days → DQE cannot use habitual/lowest* fail-open. |
| **Evidence** | Prod: 1636 products; **historyReady contract = 388 (23.7%)**; notReady = 1248. Last-3d cohort: 422 touched, 168 ready (39.8%). Sep 21–24 window: 545 products, only 21 with 4 days in-window. |
| **Impact** | DQE falls back to label/discount paths; `insufficient_price_history` dominates strong verification. |
| **Dependency** | Supply-engine dry_run sticky; discovery recording; niche sticky seeds. |
| **Architectural solution** | Sticky SKU set sized for daily re-observation; prioritize products at 3 prior days; do not lower `ML_PRICE_MIN_HISTORY_DAYS`. |
| **Done when** | ≥50% of daily evaluated ML candidates are `historyReady`; day-over-day distinct_days growth for sticky set documented. |

### P0-4 — No live automation % KPI

| | |
|--|--|
| **Problem** | Cannot answer “what % of opportunities required human intervention?” from production telemetry. |
| **Evidence** | Funnel code exists in-process; no durable automation-rate metric; mint OFF → publish always human. |
| **Impact** | 95% goal unmeasurable; Day 2+ cannot close objectively. |
| **Dependency** | Event schema for stage transitions. |
| **Architectural solution** | Emit durable events: discovered → gated → would_insert → pending → moderated → published with actor=machine|human. |
| **Done when** | Dashboard or SQL answers automation % for last 7d without manual log scraping. |

---

## P1

### P1-1 — `bot-ingest` not on Vercel Hobby crons

| | |
|--|--|
| **Problem** | `vercel.json` has supply-engine but not bot-ingest; discovery depends on external cron/GHA. |
| **Evidence** | `vercel.json`; `docs/CRON_EXTERNO_BOT.md`. |
| **Impact** | Discovery reliability depends on external schedule. |
| **Done when** | Documented external cron SLA **or** platform upgrade with cron registered. |

### P1-2 — Extraction quality / PDP reachability

| | |
|--|--|
| **Problem** | PDP often blocked; listing cards yield weak provenance → S6.1 rejects. |
| **Evidence** | Hunter hardening tests; provenance gates; worker Playwright path. |
| **Impact** | High loss between reachable and quality candidates. |
| **Done when** | Measured reachability and parse success per retailer with loss buckets. |

### P1-3 — Offer Standard only on reconcile branch vs master

| | |
|--|--|
| **Problem** | Acquisition pool integration lives on `reconcile/s61-writer` (8 commits ahead of master), not yet product SoT. |
| **Evidence** | `git log origin/master..HEAD`; `lib/hunter/offerStandard/*`. |
| **Impact** | Master lacks demand-prioritized acquisition. |
| **Done when** | Merged to master after CI green; Offer Standard remains non-DQE. |

### P1-4 — Economy ledger WIP not on master

| | |
|--|--|
| **Problem** | Canonical ledger + compensating reversal on `reconcile/economy-ledger` only. |
| **Evidence** | 3 commits ahead of master; money flags still OFF (correct). |
| **Impact** | Cannot safely prepare money later without merge. |
| **Done when** | Merged with flags still OFF; fail-closed tests pass. |

### P1-5 — DQE ignores demand / stack economics

| | |
|--|--|
| **Problem** | DemandLevel lives in Offer Standard; MSI/shipping/coupon are partial fields, not DQE signals. |
| **Evidence** | DQE signal audit Day 1. |
| **Impact** | Quality decisions miss commercial stack; acquisition and quality stay correctly split but product “deal” incomplete. |
| **Done when** | Explicit ADR: which stack signals enter DQE vs stay acquisition-only — then implement only approved ones. |

### P1-6 — Docs drift (S65 machine insert policy)

| | |
|--|--|
| **Problem** | Some SYSTEMS docs contradict current S6.1 re-check in `insertIngestedOffer`. |
| **Evidence** | Explore audit; code on reconcile branch. |
| **Impact** | Operator risk activating wrong mental model. |
| **Done when** | S65 doc reconciled to code or marked superseded by System of Record. |

---

## P2

### P2-1 — Retailer coverage mostly NOT_IMPLEMENTED

| | |
|--|--|
| **Problem** | Source coverage matrix lists many MX retailers unimplemented. |
| **Evidence** | `lib/hunter/sourceCoverage.ts`. |
| **Impact** | Cannot dominate category coverage beyond ML (+ limited Amazon/DTD). |
| **Done when** | Priority retailers implemented with Price Memory or explicit non-PM path. |

### P2-2 — Price Memory marketplace lock = mercadolibre only

| | |
|--|--|
| **Problem** | DDL CHECK marketplace = mercadolibre; Amazon uses Keepa-side intel, not PPS. |
| **Evidence** | `product_price_snapshots.sql`; `keepa.ts`. |
| **Impact** | Cross-retailer habitual price impossible in one SoT. |
| **Done when** | Multi-marketplace schema ADR + writers (no silent CHECK violations). |

### P2-3 — Distribution engine OFF / drain not on vercel.json

| | |
|--|--|
| **Problem** | Distribution code exists; engine flag OFF; drain cron not registered. |
| **Evidence** | `distribution/safety.ts`; `.env.example` notes. |
| **Impact** | Post-publish distribution cannot scale. |
| **Done when** | Staging distribution gate pass with money still OFF. |

### P2-4 — Niche provenance mostly null/legacy

| | |
|--|--|
| **Problem** | 4366/4911 PPS rows have `niche_id` null. |
| **Evidence** | MCP niche distribution. |
| **Impact** | Hard to attribute memory growth to beauty/electronics/DTD. |
| **Done when** | New writes always set niche when known; backfill optional. |

---

## P3

### P3-1 — RSS discovery reserved / stub

| | |
|--|--|
| **Problem** | RSS path documented as reserved, not active. |
| **Done when** | Implement or delete from ops status surfaces. |

### P3-2 — Deal Intelligence persistence OFF

| | |
|--|--|
| **Problem** | `DEAL_INTELLIGENCE_ENABLED` default OFF. |
| **Done when** | ADR activation with observation bridge. |

### P3-3 — Offer-side price snapshots nearly empty

| | |
|--|--|
| **Problem** | `offer_price_snapshots` = 10 rows vs product memory thousands. |
| **Done when** | Clarify role vs PPS (ADR already prefers product memory); either wire or deprecate ops focus. |

---

## Explicit non-gaps (do not open)

- Lowering `ML_PRICE_MIN_HISTORY_DAYS` below 4.
- Auto-approve machine offers to live.
- Activating rewards/commissions/settlement.
- Second production offers writer.
- Cosmetic admin UI polish.
