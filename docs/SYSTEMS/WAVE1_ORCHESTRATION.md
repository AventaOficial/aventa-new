# AVENTA — Wave 1 Orchestration Contracts

Principal Architect ownership map. Agents must not edit outside their owned paths.
Conflicts → STOP + contract proposal (no silent cross-writes).

## Canonical authorities (DO NOT DUPLICATE)

| Domain | Authority | Primary paths |
|--------|-----------|---------------|
| Supply ingest | S6/S7 bot ingest → machine pending | `lib/bots/ingest/` |
| Click | `reward_outbound_clicks` | `lib/attribution/recordAttributedClick.ts` |
| Attribution resolve | `resolveConversionAttribution` | `lib/economy/recordConversion.ts` |
| Commission | `affiliate_commissions` | `lib/economy/recordCommission.ts` |
| Ledger | `affiliate_ledger_entries` | admin + `lib/economy/settlement/` |
| Rewards | `creator_rewards` | `lib/rewards/rewardsEngine.ts` |
| Distribution | `distribution_publications` / events | `lib/distribution/` |
| Moderation | pending → approved/rejected | `lib/moderation/` |

## Workstream ownership (Wave 1)

### S8 — Supply Intelligence
- **Owns:** `lib/supply/intelligence/**`, `tests/supply/intelligence/**`
- **May read:** `lib/bots/ingest/**` (integrate, do not replace writers)
- **Forbidden:** distribution, economy, rewards, settlement flags, second pending writer
- **Branch:** `agent/s8-supply-intelligence`

### S8.1 — Hunter Benchmark
- **Owns:** `lib/supply/hunterBenchmark/**`, `tests/supply/hunterBenchmark/**`, `scripts/_hunter_benchmark_reports/**`
- **Forbidden:** production pending inserts, money, distribution
- **Branch:** `agent/s81-hunter-benchmark`
- **Contract with S8:** `HunterResult` candidates → `evaluateOpportunity` input shape

### S9 — Supply Automation (Wave 2 — blocked until S8 contracts stable)
- **Owns:** orchestration wrappers around existing ingest — NOT a second path
- **Depends on:** S8 opportunity evaluation contract

### D — Distribution harden
- **Owns:** `lib/distribution/providerContract.ts` (new), focused tests under `tests/distribution/`
- **Forbidden:** supply, economy; no mass Telegram reopen
- **Branch:** `agent/distribution`

### A — Attribution harden
- **Owns:** `lib/attribution/**` (additive), `tests/attribution/**`
- **Forbidden:** supply writers, distribution publish, settlement activation
- **Branch:** `agent/attribution`

### M2 — Money staging
- **Owns:** `lib/economy/settlement/**` additive, `scripts/m2-*`, economy settlement tests
- **Forbidden:** enable prod settlement/rewards/payouts; supply; distribution
- **Branch:** `agent/m2-money`

### O — Observability
- **Owns:** `lib/observability/**`, `app/api/admin/platform-pulse/**`, `tests/observability/**`
- **Forbidden:** mutating money/supply/distribution state
- **Branch:** `agent/observability`

## Shared freeze (all agents)

- `MONEY_PATH_FROZEN` — do not disable in committed config
- `SETTLEMENT_BRIDGE_ENABLED` — default OFF
- `REWARDS_PROGRAM_ACTIVE` / `COMMISSION_PROGRAM_ACTIVE` — OFF
- Production migrations — never auto-apply
- `vercel.json` production — do not add distribution-drain / settlement crons

## Pipeline (target)

```
SUPPLY INTELLIGENCE → HUNTER BENCHMARK → SUPPLY AUTOMATION
→ MODERATION → DISTRIBUTION → ATTRIBUTION → COMMISSION → SETTLEMENT → REWARDS
```

## Cron / workers (existing)

- `/api/cron/bot-ingest`, `bot-ingest-candidates`, `supply-engine`
- `/api/cron/distribution-drain` (staging-gated; omitted from prod vercel.json)
- `/api/cron/process-write-queue`, digests, integrity, rewards-release-holds

## Wave 1 status (2026-09-19)

| Stream | Branch / worktree | Status | Targeted tests |
|--------|-------------------|--------|----------------|
| S8 Supply Intelligence | `agent/s8-supply-intelligence` | Foundation DONE | 14 passed |
| S8.1 Hunter Benchmark | `agent/s81-hunter-benchmark` | Contract DONE | 14 passed |
| Attribution | on `staging` (committed) | Hardened DONE | 43 passed |
| Distribution | `agent/distribution` | Contract harden DONE | 12 passed |
| M2 Money staging | main + settlement | Canary DONE (OFF) | economy 96 passed |
| Observability | `agent/observability` | Pulse DONE (merge-safe, no settlement ownership) | 7 passed |
| S9 Automation | — | **Wave 2 blocked** until S8 merge | — |

### Merge risks (resolve before integrate)

- **Observability** must not introduce `lib/economy/settlement/**` (flag mirrored locally for pulse).
- **Distribution** `drain.ts` UNKNOWN_OUTCOME narrowing — review vs C3 reclaim on staging before merge.
- **S8.1** handoff: `hunterCandidateToS8Input()` → S8 `evaluateOpportunity`.
- Merge order unchanged: Obs → Dist → S8.1 → S8 → M2 overlays.

### Layering note (do not confuse)

- `lib/supplyIntelligence/` = S4 SourceAdapter dry-run (listing normalize)
- `lib/supply/intelligence/` = S8 opportunity evaluation engine
- `lib/supply/hunterBenchmark/` = S8.1 external hunter normalize + metrics

S9 must call S8 `evaluateOpportunity` before machine pending insert — observation-only until canary flag.
