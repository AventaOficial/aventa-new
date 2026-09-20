# WAVE 3 — Staging E2E Runbook

## Scripts

```bash
# Dry-run (decision only)
npx tsx scripts/wave3-staging-e2e.ts

# Live seams through Dist→Click (Settlement OFF)
npx tsx scripts/wave3-staging-e2e.ts --execute

# Settlement canary SEPARATE (requires approved commission + tables)
npx tsx scripts/wave3-settlement-canary.ts --commissionId=<uuid>
npx tsx scripts/wave3-settlement-canary.ts --commissionId=<uuid> --execute
```

Reports: `scripts/_wave3_reports/`

## Required env (.env.local)

- `AVENTA_SUPABASE_TARGET=staging`
- `AVENTA_EXPECTED_SUPABASE_REF=oojshofrpbfwsiypcecr`
- Staging service role
- Dedicated machine author via `scripts/_s72_reports/s72-author-latest.json` or `BOT_INGEST_USER_ID`

## Process-scoped flags

| Phase | Flags |
|-------|-------|
| E2E execute | `SUPPLY_AUTOMATION_ENABLED=true`, machine writes via `withMachinePendingWritesEnabled`, `DISTRIBUTION_ENGINE_ENABLED=true` briefly |
| E2E always | Settlement OFF, Rewards OFF, Money frozen |
| Settlement canary | `SETTLEMENT_BRIDGE_ENABLED=true`, `MONEY_PATH_FROZEN=false`, Rewards OFF |
| After any script | `restoreWave3FailClosedFlags()` |

## Provider

Drain uses **controlled** adapter only — never Telegram production HTTP.

## Known staging blocker (2026-09-19)

`affiliate_conversions` / money foundation tables are **not present** in staging PostgREST schema cache.

E2E therefore:

- **PASS** through: Hunter→S8→S9→S7→Moderation→Distribution→Click
- **BLOCKED** at: Conversion→Commission→Settlement

Do **not** invent DDL in this campaign. Apply foundation migrations via the normal staging schema process, then re-run conversion + settlement canary.
