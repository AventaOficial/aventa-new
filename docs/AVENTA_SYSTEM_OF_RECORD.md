# AVENTA — System of Record (Day 1 Architecture Lock)

**Status:** OFFICIAL  
**Date locked:** 2026-09-24 (America/Mexico_City) / query window UTC 2026-09-25  
**Code base:** `day1/architecture-lock` @ `039874b` (contains `reconcile/s61-writer` ahead of `origin/master` @ `c5a183b`)  
**Product SoT:** `origin/master`  
**This document SoT:** architecture and domain authority for Days 2–14  

This document describes the **real** system as implemented, not aspirational vision.

---

## 1. Mission

Aventa is a dominant offer-intelligence platform for Mexico. The machine must:

**DISCOVER → FETCH → EXTRACT → NORMALIZE → IDENTIFY → REMEMBER PRICE → UNDERSTAND DEMAND → EVALUATE DEAL → VERIFY → DEDUPE → DECIDE → MODERATE ONLY WHEN NECESSARY → PUBLISH → DISTRIBUTE → MEASURE → LEARN**

Operational target: **≥95% of the opportunity flow runs without human intervention**. Humans intervene on exceptions, ambiguity, critical ops, and business decisions.

---

## 2. Product thesis

1. **Price Memory** is the foundation of verifiable deals (not seller-claimed discounts).
2. **Offer Standard** decides *what to chase* (acquisition). **DQE** decides *whether it is a deal* (quality).
3. **One sole writer** owns offer mutation. Publication is a separate human authority today.
4. **Money is off.** Attribution may record clicks; commissions/rewards/settlement do not mint value until explicitly activated.
5. **Home feed ≠ search ≠ distribution ≠ monetization.** Domains stay decoupled.

---

## 3. System architecture

```
                    ┌─────────────────────────────────────┐
                    │         EXTERNAL WORKERS            │
                    │  ML Playwright / GHA / env URLs     │
                    └─────────────────┬───────────────────┘
                                      │
┌──────────────┐   ┌──────────────────▼───────────────────┐
│ Offer Standard│──▶│              HUNTER                  │
│ (acquisition) │   │  discovery · fetch · extract · rank  │
└──────────────┘   └──────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │         Price Memory (ML)            │
                    │   product_price_snapshots (daily)    │
                    └─────────────────┬───────────────────┘
                                      │
                    ┌─────────────────▼───────────────────┐
                    │  DQE → S6.1 gate → S7 bridge         │
                    │  (quality / mint eligibility)        │
                    └─────────────────┬───────────────────┘
                                      │ writes OFF by default
                    ┌─────────────────▼───────────────────┐
                    │     SOLE WRITER                      │
                    │  ingestOfferObservation              │
                    │  offers + offer_observations         │
                    └─────────────────┬───────────────────┘
                                      │ status=pending
                    ┌─────────────────▼───────────────────┐
                    │  MODERATION (human) → PUBLICATION    │
                    │  FEED / SEARCH / (dist OFF)          │
                    │  ATTRIBUTION / ECONOMY (money OFF)   │
                    └─────────────────────────────────────┘
```

**Runtime surfaces**

| Surface | Role |
|---------|------|
| Next.js App Router (`app/`) | UI + API + crons |
| `lib/hunter`, `lib/bots/ingest` | Discovery + quality machine |
| `lib/offers/ingestion` | Sole offer writer |
| `workers/mercadolibre-worker` | External ML scrape → POST ingest |
| Vercel crons (`vercel.json`) | Digests, integrity, supply-engine, payouts (gated) |
| Supabase Postgres | Product DB (prod `mkgsrpsuvedwwlzmzmzh`, staging `oojshofrpbfwsiypcecr`) |

---

## 4. End-to-end pipeline (real)

| Stage | Code authority | Status |
|-------|----------------|--------|
| DISCOVERY | `lib/hunter/engine.ts`, sources, `runIngestCycle`, worker | AUTOMATED |
| FETCH | ML API, PA-API, Playwright worker, `ingestHttp` | AUTOMATED |
| EXTRACTION | `enrichParsedOffer`, HTML/ML parsers | PARTIAL (PDP often blocked; cards weak) |
| NORMALIZATION | `hunter/normalize`, URL/fingerprint | AUTOMATED |
| IDENTITY | `offers/ingestion/identity.ts` | AUTOMATED |
| PRICE MEMORY | `mlPriceEngine.ts` → `product_price_snapshots` | PARTIAL (accumulating; readiness incomplete) |
| OFFER STANDARD | `lib/hunter/offerStandard/*` | AUTOMATED (acquisition only) |
| DQE | `lib/hunter/dealQuality/*` | AUTOMATED |
| S6.1 | `candidateInsertGate.ts` / `evaluateMachineCandidateGate` | AUTOMATED |
| S7 | `writePendingViaS7Bridge.ts` | PARTIAL (code ready; writes OFF) |
| SOLE WRITER | `ingestOfferObservation.ts` | AUTOMATED path; machine mint OFF |
| OBSERVATION | `offer_observations` append | PARTIAL (schema live; **0 rows in prod**) |
| PENDING | machine/community → `offers.status=pending` | PARTIAL (machine writes OFF; prod pending=0) |
| MODERATION | `app/api/admin/moderate-offer` | HUMAN |
| PUBLICATION | Approve path | HUMAN |
| FEED / SEARCH | `feedService`, `searchPublicOffers` | AUTOMATED (on approved) |
| DISTRIBUTION | `lib/distribution/*` | OFF (`DISTRIBUTION_ENGINE_ENABLED`) |
| ATTRIBUTION | `recordAttributedClick` | PARTIAL |
| ECONOMY | rewards/commissions/settlement | OFF / fail-closed |

---

## 5. Domain boundaries

| Domain | Owns | Must not own |
|--------|------|--------------|
| Hunter / Offer Standard | Candidate acquisition & prioritization | Deal truth, publication, money |
| Price Memory | Daily product price truth (ML) | Offer lifecycle, ranking |
| DQE | Deal quality decision | Acquisition ranking, mint without S6.1 |
| S6.1 / S7 | Machine mint eligibility & pending bridge | Auto-approve / live publish |
| Sole writer | Insert/merge offers + observations | Status→approved, money |
| Moderation | Approve/reject | Discovery, Price Memory writes |
| Feed / Search | Public discovery UX | Monetization |
| Distribution | Post-approve fan-out | Ranking as money |
| Attribution | Click / outbound evidence | Settlement |
| Economy | Ledger, rewards, commissions | Offer quality |

---

## 6. Data authorities

| Entity | Table / store | Authority |
|--------|---------------|-----------|
| Offer canonical | `offers` | Sole writer create; moderation status |
| Observation evidence | `offer_observations` | Sole writer append |
| Product price history | `product_price_snapshots` | `recordMlDailySnapshots` |
| Offer price trail | `offer_price_snapshots` | Ingest path (sparse) |
| Outbound clicks | `reward_outbound_clicks` | Attribution recorder |
| Hunter telemetry | `hunter_*` / in-memory cycle summaries | Hunter ops |

---

## 7. Single writer

**Sole production writer of `offers` inserts:**  
`lib/offers/ingestion/ingestOfferObservation.ts`

Machine path: `insertIngestedOffer` → sole writer (forces pending; re-checks S6.1).  
S7: `writePendingViaS7Bridge` → `insertIngestedOffer` (not a second writer).  
Community: `app/api/offers/route.ts` → sole writer.

Publication authority: `app/api/admin/moderate-offer/route.ts` (human).

Staging scripts/tests may insert directly — **not** production authorities.

---

## 8. Hunter

Multi-source collector (`engine.ts`) feeding:

- Legacy cron `bot-ingest` (discovery-only under S9.1 — no mint)
- External worker batch (`externalWorker.ts`)
- Supply engine cron (`/api/cron/supply-engine`, default `dry_run` for Price Memory accumulation)

**Sources implemented:** ML API/legacy, ML worker, Amazon PA-API/ASIN, env URLs, day-to-day retailers (gated).  
**Many retailers:** `NOT_IMPLEMENTED` (`sourceCoverage.ts`).  
**Dedupe:** URL fingerprint + `ingestion_identity_key` UNIQUE.  
**Funnel metrics:** `lossFunnel`, `cycleFunnelSummary`, supply ops summaries (code exists; live machine funnel incomplete while writes OFF).

---

## 9. Offer Standard

**≠ DQE.**

Responsible for DemandLevel (1–5), demand catalog, query families, niche profiles, acquisition scoring, pool prioritization (`prioritizeAcquisitionPool`).

May change *who reaches* DQE (order/top-K). Must never override DQE or bypass S6.1.

---

## 10. Price Memory

**Contract:** `ML_PRICE_MIN_HISTORY_DAYS = 4` in `mlPriceEngine.ts`.  
`historyReady` = ≥4 distinct prior days (excluding today) in 90d window.  
Without readiness: `lowest30d` / `lowest90d` / `habitual30d` = `null` (fail-closed).

**SoT table:** `product_price_snapshots` (UNIQUE marketplace, product_id, recorded_on).  
**Marketplace today:** `mercadolibre` only.

**Day 1 census (prod, read-only MCP):** see `docs/AVENTA_PRICE_MEMORY_DAY1.md`.

Verdict: **accumulating correctly**; large share still not `historyReady` for DQE strong history paths.

---

## 11. DQE

Core: `evaluateDealQuality` + qualification + evidence contract.

Decisions: `VERIFIED_DEAL` | `POTENTIAL_DEAL` | `NO_VERIFIED_DEAL` | `REJECT` | `DUPLICATE` (+ related kinds).

Signals: see Gap Register / Day 1 result — price, discount, history, availability, confidence, image, duplicate, provenance, artificial list price are real; demand/brand/MSI/shipping/cashback are not DQE authorities.

---

## 12. S6.1 / S7

- **S6.1 (machine):** `evaluateMachineCandidateGate` — DQE bind + provenance + history eligibility for mint.
- **S7:** bridge to pending via sole writer after gate.
- **Naming collision:** `lib/dealAlerts/*` also mentions S6.1 (alertability) — different domain.

Machine pending writes require `BOT_INGEST_MACHINE_PENDING_WRITES` and are blocked in production by `machineWriteAuth`.

---

## 13. Moderation

Human approve/reject. Affiliate readiness gates exist (`approveReadiness`).  
No machine auto-publish of live offers.

---

## 14. Publication

Approve sets offer live for feed/search.  
Does **not** imply monetization or distribution engine activation.

---

## 15. Distribution

`DISTRIBUTION_ENGINE_ENABLED` default OFF.  
Home feed and search operate on approved offers independently of distribution drain.

---

## 16. Attribution

Click / outbound recording exists. Settlement and rewards remain gated.

---

## 17. Economy

| Flag / boundary | Default posture |
|-----------------|-----------------|
| `REWARDS_PROGRAM_ACTIVE` | OFF (absent) |
| `COMMISSION_PROGRAM_ACTIVE` | OFF |
| `SETTLEMENT_BRIDGE_ENABLED` | OFF |
| `ECONOMIC_LEDGER_BOUNDARY.settlementEnabled` | `false` hardcoded |
| `MONEY_PATH_FROZEN` | ON in production if unset |
| Machine mint / auto-publish | OFF |

WIP ledger hardening exists on `reconcile/economy-ledger` (not merged to master). Money stays OFF.

---

## 18. Observability

**Answerable today:** Price Memory coverage; discovery/supply dry-run would-insert; DQE/S6.1 gate reasons in cycle summaries; retailer circuit health where instrumented.

**Weak / missing:** end-to-end automation % as a live KPI; observation evidence volume (0 rows); machine funnel pending→publish while mint OFF; cost-per-opportunity; full retailer block taxonomy for day-to-day.

---

## 19. Security

- Service role for server writes; RLS on sensitive tables.
- Money fail-closed in production.
- Machine writes production-blocked.
- Public community cannot set privileged `offerExtras`.
- No Day 1 activation of money or auto-publish.

---

## 20. Automation model

| Stage | Mode |
|-------|------|
| Discovery → DQE → S6.1 decision | AUTOMATED |
| Machine pending mint | MIXED / OFF |
| Moderation → publish | HUMAN |
| Distribution / money | OFF |

Current **operational automation of the full opportunity path to live offers** is dominated by human moderation and mint kill-switches. Target ≥95% automated *flow* once mint+auto-exception paths are policy-approved — not 95% of codebase.

---

## 21. Current state (Day 1 facts)

- `origin/master` @ `c5a183b`: production SoT for product.
- Valuable unmerged WIP on `reconcile/s61-writer` / this branch: S6.1 writer boundary, Offer Standard acquisition pool, feed period fixes, Liverpool identity hardening (+tests).
- Valuable unmerged WIP on `reconcile/economy-ledger`: canonical ledger + compensating reversal (money still OFF).
- Dirty worktree preserved on `aventa-rescue-s61` (stash `day1-preserve-rescue-s61-dirty-20260924`) — largely overlaps S61 cluster already committed on reconcile branch (**class B/C**).
- Prod: 766 offers, 76 approved, 0 pending, 0 `offer_observations`, 4911 Price Memory rows.

---

## 22. Known gaps

See `docs/AVENTA_DAY1_GAP_REGISTER.md`.

---

## 23. Explicit non-goals (Day 1 / near-term)

- Activating money, rewards, commissions, settlement, machine mint in production.
- Redesigning DQE with new signal set.
- Merging all worktrees into master automatically.
- Cosmetic UI refactors.
- Inventing Price Memory numbers or forcing historyReady.

---

## 24. Definition of Done (architecture lock)

1. Pipeline reconstructed from code — **DONE**
2. Single-writer audit — **DONE**
3. Price Memory measured from prod — **DONE**
4. Official docs created — **DONE** (this file + gap + PM + machine contract)
5. Economy remains OFF — **DONE**
6. WIP preserved — **DONE**
7. No destructive git — **DONE**

---

## 25. 14-day execution target

Close the **machine path to pending** under controlled staging, grow Price Memory sticky coverage so DQE history paths dominate, instrument automation %, keep publication human until exception policy is proven, keep money OFF until ledger authority on `reconcile/economy-ledger` is merged and canaries pass.

**Day 2 concrete target:** execute against P0 gaps in the Gap Register (observation evidence live path + Price Memory sticky continuity + automation KPI event), without activating money.
