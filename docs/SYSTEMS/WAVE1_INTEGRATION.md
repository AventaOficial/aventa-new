# AVENTA — Wave 1 Integration Contract

Integrated on `staging` without activating production money, distribution, or machine writes.

## End-to-end authority chain

```
External Hunter (ChatGPT / Grok / other)
  → HunterResult (lib/supply/hunterBenchmark)           [NO DB offer writes]
  → hunterCandidateToS8Input()
  → opportunityCandidateFromHunterHandoff()
  → evaluateOpportunity() (lib/supply/intelligence)     [side-effect free]
  → (future S9) observe before machine pending
  → S6/S7 insertIngestedOffer → offers (pending)        [S7 ONLY writer]
  → Moderation → approved/rejected
  → Distribution enqueue/claim/publish                  [OFF by default]
  → Attribution reward_outbound_clicks                  [track-outbound]
  → affiliate_conversions / affiliate_commissions
  → Settlement bridge → affiliate_ledger_entries        [OFF by default]
  → creator_rewards / payouts                           [OFF by default]
```

## Who writes which table

| Table / store | Writer authority | Wave 1 status |
|---------------|------------------|---------------|
| `offers` (pending) | `lib/bots/ingest` S6/S7 | Canonical — S8/S8.1 must NOT write |
| `reward_outbound_clicks` | `recordAttributedClick` | Canonical |
| `affiliate_conversions` | `recordConversion` | Canonical |
| `affiliate_commissions` | `recordCommission` | Canonical |
| `affiliate_ledger_entries` | admin CSV + `settleCommission` | Settlement OFF |
| `creator_rewards` | `createRewardFromLedgerEntry` | Rewards OFF |
| `distribution_publications` | `lib/distribution` | Engine OFF |
| `hunter_benchmark_*` | staging migration only | Not applied to production |
| `scripts/_hunter_benchmark_reports/` | S8.1 file store | Local/staging evidence |

## Module boundaries

| Path | Role |
|------|------|
| `lib/supplyIntelligence/` | **Legacy S4** — SourceAdapter dry-run / ML worker listing normalize |
| `lib/supply/intelligence/` | **Canonical S8** — `evaluateOpportunity()` opportunity assessment |
| `lib/supply/hunterBenchmark/` | **S8.1** — normalize/compare external hunters |
| `lib/observability/` | Read-only platform pulse |
| `lib/distribution/providerContract.ts` | Adapter contract docs + guards (C3 drain remains reclaim-based) |
| `lib/economy/settlement/` | **Canonical M1/M2** — never duplicated by Observability |

## Flags (fail-closed defaults)

- `DISTRIBUTION_ENGINE_ENABLED` — OFF
- `SETTLEMENT_BRIDGE_ENABLED` — OFF
- `MONEY_PATH_FROZEN` — production fail-closed ON when unset
- `REWARDS_PROGRAM_ACTIVE` — OFF
- `COMMISSION_PROGRAM_ACTIVE` — OFF

## Integration merges (Wave 1)

1. Observability — already on staging; uses canonical `isSettlementBridgeEnabled` (no settlement stub)
2. Distribution — providerContract only; **drain.ts C3 reclaim preserved** (worktree drain rejected as regression)
3. S8.1 Hunter Benchmark — already on staging + staging-only SQL doc
4. S8 Supply Intelligence — added `lib/supply/intelligence/**` + handoff adapter

## Explicit non-goals (this checkpoint)

- No S9 automation
- No production migrations applied
- No Telegram production calls
- No push / deploy
