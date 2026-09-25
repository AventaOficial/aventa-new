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
| **Problem** | Machine opportunity flow stops before pending in **production**. |
| **Evidence** | Prod pending=0; `machineWriteAuth` production blocked. **Day 2:** staging canary minted pending via S7→sole writer (`b67f1537-…`). |
| **Impact** | Prod automation Hunter→pending still 0%. Staging path proven. |
| **Dependency** | Staging canary (Day 2 DONE) → explicit prod pending-only policy. |
| **Architectural solution** | Controlled staging mint → measured canary → explicit production policy for pending-only writes (never auto-approve). |
| **Done when** | Staging produces pending via sole writer with S6.1 — **PASS (Day 2)**. Prod policy still open. |

### P0-2 — `offer_observations` evidence lane is empty in production

| | |
|--|--|
| **Problem** | Observation table empty in **production**. |
| **Evidence** | Prod obs=0. **Day 2 staging:** 2 observations for offer `b67f1537-…` via sole writer. |
| **Impact** | Prod audit trail still blind; staging evidence path proven. |
| **Done when** | Staging observations appear — **PASS (Day 2)**. Prod deploy of observation path still required. |

### P0-3 — Price Memory sticky continuity insufficient for DQE majority

| | |
|--|--|
| **Problem** | Most products lack ≥4 prior days; tip volume tracked ml_api cadence. |
| **Evidence** | **Day 5 root cause:** ml_api_legacy runs ~100→1/day; **ml_worker never persisted PM**. Fix: `persistPriceMemoryFromWorkerMetas` in externalWorker + `/api/cron/pm-freshness` + OAuth fail-open. |
| **Impact** | After deploy, worker cadence (~6–10/day × ~36) can sustain tips without ml_api volume. historyReady ≥50% still open. |
| **Done when** | Daily MX tip reliable via worker and/or restored ml_api schedule — **PARTIAL** (code DONE; prod deploy pending). |

### P0-4 — No live automation % KPI

| | |
|--|--|
| **Problem** | Automation % not durable / easily inflated. |
| **Evidence** | **Day 4:** hardened `automationCycleMetrics` (dry-run/duplicate resistant) + lifecycle contract + `terminal_rate`. Staging proof `automation_rate=0`, `terminal_rate=1`. |
| **Done when** | KPI durable and tested — **PASS (Day 4)**. Dashboard rollup still open. |

### P0-5 — Continuous discovery required operator URL paste

| | |
|--|--|
| **Problem** | Hunter depended on env_urls / pasted candidates. |
| **Evidence** | Day 3 continuous cycle. Day 4 human matrix marks URL paste **removed**. |
| **Done when** | Cycle starts without URL paste — **PASS**. |

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
