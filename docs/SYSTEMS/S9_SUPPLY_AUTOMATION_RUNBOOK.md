# S9 Supply Automation — Runbook

Checkpoint base: Wave 1 integrated (`d06a026` lineage).

## Purpose

Orchestrate **S8 Opportunity Intelligence → S7 machine pending** with server-side policy.

S9 does **not** publish, distribute, reward, or settle money.

## Flags (all default OFF / fail-closed)

| Flag | Role |
|------|------|
| `SUPPLY_AUTOMATION_ENABLED` | S9 master gate |
| `BOT_INGEST_MACHINE_PENDING_WRITES` | S7 write kill switch (scoped by `withMachinePendingWritesEnabled`) |
| `S9_MAX_CANDIDATES_PER_RUN` | server cap (default 20, hard 50) |
| `S9_MAX_WRITES_PER_RUN` | server cap (default 5, hard 5) |
| `S9_MAX_WRITES_PER_SOURCE` | server cap (default 3, hard 5) |

Downstream must stay OFF: `DISTRIBUTION_ENGINE_ENABLED`, `REWARDS_PROGRAM_ACTIVE`, `COMMISSION_PROGRAM_ACTIVE`, `SETTLEMENT_BRIDGE_ENABLED`. Money freeze untouched.

## Dry-run (safe)

```bash
npx tsx scripts/s9-staging-canary.ts
# or
npx tsx scripts/s9-staging-canary.ts --cap=3
```

`--cap` may only **lower** server caps.

## Staging execute (N≤5, one-shot)

```bash
# staging env only — never production
export SUPPLY_AUTOMATION_ENABLED=true
export BOT_INGEST_USER_ID=<dedicated-machine-author-uuid>
# BOT_INGEST_MACHINE_PENDING_WRITES is set only inside withMachinePendingWritesEnabled

npx tsx scripts/s9-staging-canary.ts --execute --cap=5
```

Expect:

1. Dry and live `decisionFingerprint` match
2. At most N pending rows (`status=pending`)
3. Retry same URL → `DUPLICATE` / no second row
4. No Distribution / Rewards / Settlement side effects

Evidence: `scripts/_s9_reports/s9-canary-latest.json`

## Pipeline

```
HunterResult
  → automationCandidatesFromHunterResult
  → evaluateOpportunity (S8)
  → evaluateSupplyPolicy (S9)
  → [execute] withMachinePendingWritesEnabled
       → writePendingViaS7Bridge
         → insertIngestedOffer (pending only)
```

## Decision codes

`ELIGIBLE` | `REJECTED` | `SUPPRESSED` | `DUPLICATE` | `BUDGET_REJECTED` |
`INVALID_PROVENANCE` | `LOW_QUALITY` | `RISK_REJECTED` | `WRITE_BLOCKED` |
`S8_FAILURE` | `MALFORMED_INPUT` | `S9_DISABLED` | `S7_WRITES_DISABLED` |
`INVALID_CONFIG` | `INVALID_AUTHOR` | `PRODUCTION_BLOCKED`

## Failure model (fail-closed)

| Case | Expected |
|------|----------|
| S9 OFF | `S9_DISABLED`, no write |
| S7 writes OFF (execute) | `S7_WRITES_DISABLED` / `WRITE_BLOCKED` |
| Production runtime | `PRODUCTION_BLOCKED` |
| Missing provenance / image | `INVALID_PROVENANCE` |
| Cap exceeded | `BUDGET_REJECTED` |
| Duplicate URL / in-run | `DUPLICATE` |
| S8 throw | `S8_FAILURE` |
| Invalid author | `INVALID_AUTHOR` |

## Continuous automation

**Do not enable.** Canary is one-shot N≤5 only.

## Ownership

- Policy: `lib/supply/policy/`
- Orchestrator: `lib/supply/automation/`
- S7 bridge: `lib/supply/s7Bridge/`
- Tests: `tests/supply/s9/`
