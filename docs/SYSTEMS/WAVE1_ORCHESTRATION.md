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

## Merge order (after Wave 1 DONE)

1. Observability (lowest coupling)
2. Attribution
3. Distribution harden
4. M2 settlement staging helpers
5. S8.1 hunter benchmark
6. S8 supply intelligence
7. Then Wave 2 S9
