# AVENTA — Day 9 Continuous Discovery Autonomy

## Objective

Make Continuous Discovery a durable, autonomous production process with DB-backed concurrency safety — without enabling mint or money.

## Cron architecture (already on master via Day 8 #19–#21)

| Item | Value |
|------|--------|
| Path | `GET /api/cron/continuous-discovery` |
| Schedule | `0 17 * * *` (17:00 UTC daily) |
| Why daily | Vercel Hobby allows at most one cron trigger per path per day; `vercel.json` rejects query strings |
| Auth | `requireCronSecret` (Vercel Cron sends `Authorization: Bearer CRON_SECRET`) |
| Execution | `cronSafe: true` → dry-run, mint forbidden |
| Budget | `maxPrioritized=8`, soft deadline `180s` before 300s hard kill |
| Alias | `GET /api/cron/bot-ingest?mode=continuous` (manual/external only) |

Sub-daily cadence requires Vercel Pro or an external scheduler. Native Hobby cron is sufficient for autonomous daily discovery.

## Day 9 addition — concurrency lease

`UNIQUE(cycle_id)` on `discovery_cycle_snapshots` is the authority.

1. Scheduled invocation claims the hour-bucket `cycle_id` (`continuous-YYYY-MM-DD-HH` Mexico time).
2. Concurrent / duplicate callers with the same `cycle_id` skip (`completed` or `in_progress`).
3. Final / deadline snapshot updates are gated by `claim_token` (no blind overwrite).
4. Stale claims older than 8 minutes can be reclaimed after a killed run.
5. Fail-open if the table/client is missing (unguarded seed).

## Safety unchanged

money / rewards / commissions / settlement / distribution / auto-publish / machine mint / ranking: **OFF**  
DQE / S6.1 / sole writer / PM / source isolation: **intact**

## Staging canary

```bash
npx tsx --env-file=.env.local scripts/day8-continuous-cron-canary.ts
```

Expect: one snapshot row, second invocation lease-skipped, `pending_created=0`, `mintAttempted=false`.
