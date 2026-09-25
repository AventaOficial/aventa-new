# AVENTA — Day 8 Production Integration

**Branch:** `day8/production-integration`  
**Base:** `origin/master` @ Day 5 (`017f291`)  
**Contents:** Day 6 (`85d4cd3`) + Day 7 (`794fd52`) + Day 8 durable truth

## Integration method

```
git worktree add -b day8/production-integration … origin/master
git merge --ff-only origin/day7/verified-yield
```

Linear history preserved. No file copying. No duplicate commits.

## Durable metrics (Phase 6)

1. **`hunter_supply_runs`** — per-source Supply Truth from continuous discovery (`persistContinuousDiscoveryTruth`)
2. **`discovery_cycle_snapshots`** — full verifiedYield JSON per `cycle_id` (staging applied; prod apply at deploy)

Scripts:

```bash
npx tsx --env-file=.env.local scripts/day8-production-integration-canary.ts
npx tsx --env-file=.env.local scripts/day8-verified-yield-24h-report.ts
```

## Safety unchanged

money / rewards / commissions / settlement / distribution / auto-publish / machine mint: OFF  
DQE / S6.1 / sole writer / PM-4 / idempotency: intact
