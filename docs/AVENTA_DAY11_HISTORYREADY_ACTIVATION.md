# AVENTA — DAY 11 HistoryReady Activation & Verified Yield

## Question

Now that Price Memory has SKUs with ≥4 distinct observation days, what happens to:

`historyReady → PM ready → Offer Standard → DQE VERIFIED → S6.1 PASS`?

Day 11 **measures**; it does not relax PM/DQE/S6.1/S7/money.

## Production PM baseline (pre-implementation audit)

| Metric | Value |
|--------|------:|
| total observations | 5105 |
| unique products | 1678 |
| historyReady (≥4 distinct prior days) | **406** |
| exactly 4 days | 95 |
| >4 days | 311 |
| nearReady 1d / 2d / 3d+ | 157 / 260 / (rest) |
| tips today | 188 |
| tips last 4 days | 786 |
| approx activated today (3→4 with tip) | **16** |
| `ML_PRICE_MIN_HISTORY_DAYS` | **4** |

Limitation: `approx_activated_today` has no durable before/after table — derived from tip-today ∩ (prior distinct days before today == 3).

## Day 10 baseline (single prod cycle)

`continuous-2026-09-25-23`: discovered=11, pm_ready=8, dqe_verified=3, dqe_potential=2, s61_pass=1.

Day11 vs Day10 is **not** a statistical uplift claim — denominators differ.

## Architecture

1. **Census** — `loadHistoryReadyCensus()` from `product_price_snapshots` (distinct `recorded_on`).
2. **Reactivation source** — `sticky_history_ready` via `selectHistoryReadyReactivationTargets` / `collectHistoryReadyReactivationCandidates` (prefer activated-today; cooldown; no fabricated history).
3. **Measurement** — `buildHistoryReadyActivationFromTraces` → `historyReady_to_s61_yield` and conversions.
4. **Persist** — snapshot payload includes `history_ready_activation` + `deadline_budget` (closes Day10 observability gap).

## Invariants

- `ML_PRICE_MIN_HISTORY_DAYS = 4` unchanged
- DQE / S6.1 / sole writer / lease / cronSafe mint OFF unchanged
- Same-day PM tips do not count as extra history days
- dry-run / pending_created=0 expected

## KPI

`historyReady_to_s61_yield = s61_pass / history_ready_candidates_evaluated`

Also: historyReady→OS, OS→DQE VERIFIED, DQE→S6.1, by `source_id`.

## Tests / canary

- `tests/hunter/discovery/day11HistoryReadyActivation.test.ts`
- `scripts/day11-historyready-activation-canary.ts`

## Status

READY FOR PRODUCTION after PR CI — **do not auto-merge**.
