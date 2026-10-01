# AVENTA — Day 7 Verified Yield

**Branch:** `day7/verified-yield`  
**Authority:** Day 6 @ `85d4cd3`

## Objective

Measure **why candidates fail to become VERIFIED deals** and prioritize **near-ready Price Memory SKUs** (1–3 days from `historyReady`) without weakening DQE, S6.1, PM-4, sole writer, or money paths.

## Bottleneck (evidence)

Day 6 proved multisource discovery and per-source funnels, but aggregate KPIs still could not answer:

- What fraction of identity-valid candidates die on **insufficient history** vs **artificial list price** vs **DQE** vs **fetch blocks**?
- How many SKUs are **one calendar day away** from the 4-day PM gate?
- Is acquisition budget spent on the closest-to-ready SKUs?

## What Day 7 implemented

1. **Primary terminal reason** — exactly one reason per candidate (`verifiedYieldTerminal.ts`). Extends Day 4 loss codes with DQE/S6.1 specificity.

2. **VERIFIED-yield funnel** — discovered → canonicalized → identity_valid → pm_ready → offer_standard → dqe_verified → s61_pass, with rates:
   - `verified_yield` = dqe_verified / identity_valid
   - `s61_yield` = s61_pass / dqe_verified
   - `history_block_rate` = insufficient_history / identity_valid
   - `artificial_price_rate` = artificial_price / identity_valid

3. **Near-ready day buckets + budget** — 50% → 1 day away, 30% → 2 days, 20% → 3+ days (`allocateNearReadyBudget`). Default `SUPPLY_NEAR_READY_MAX=24`.

4. **Automation split** — `blocked_quality` vs `blocked_external` (still rolls into `blocked` for terminal_rate; no double-count).

5. **Acquisition boosts (demand only)** — daysUntilReady 0:+20, 1:+18, 2:+12, 3:+8. **Never bypasses DQE/S6.1.**

6. **Continuous discovery wiring** — measures near-ready pool at cycle start; tracks `verifiedYield` + capped `terminalTraces` (50); Day 7 operator verdict includes `nearReady` and `hist_block`.

## Safety

- `ML_PRICE_MIN_HISTORY_DAYS = 4` — unchanged
- money / rewards / commissions / settlement: OFF
- machine mint: OFF unless explicit staging flag
- sole writer / DQE / S6.1: untouched

## Staging canary (dry-run, no mint)

```bash
npx tsx --env-file=.env.local scripts/day7-verified-yield-canary.ts
```

Reports land in `scripts/_day7_reports/`.

## Tests

```bash
npx vitest run tests/hunter/discovery/day7VerifiedYield.test.ts
```

## Next highest-leverage objective

Drive `ml_worker` + near-ready sticky observations so more SKUs cross the 4-day gate — increasing `verified_yield` and `s61_yield` without lowering gates.
