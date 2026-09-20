# AVENTA — S9 Supply Automation Architecture

Checkpoint base: `d06a026` (Wave 1 integrated).

## Ownership

| Module | Path | Owns | Must NOT |
|--------|------|------|----------|
| S8 Intelligence | `lib/supply/intelligence/` | opportunity evaluation, score, evidence | write offers, publish, settle |
| S8.1 Hunter Benchmark | `lib/supply/hunterBenchmark/` | normalize HunterResult, metrics | write offers |
| Legacy S4 | `lib/supplyIntelligence/` | dry-run SourceAdapter | fused with S8 |
| **S9 Policy** | `lib/supply/policy/` | eligibility, caps, reason codes | scoring engine, DB writes |
| **S9 Automation** | `lib/supply/automation/` | orchestration, dry/live same pipeline | direct offers insert |
| **S9→S7 Bridge** | `lib/supply/s7Bridge/` | map evaluation → ParsedOfferMetadata + call S7 | second writer |
| S7 Machine write | `lib/bots/ingest/insertIngestedOffer.ts` | **sole** machine pending insert | — |
| Write activation | `withMachinePendingWritesEnabled` | scoped `BOT_INGEST_MACHINE_PENDING_WRITES` | leave flag ON |

## Authorities (canonical)

```
Opportunity evaluation  → evaluateOpportunity (S8)
Quality gate (S6.1)     → evaluateMachineCandidateGate / evaluateMachineLiveInsertEligibility
Duplicate               → findDuplicateOfferByUrl + product_fingerprint UNIQUE
Provenance              → preserveMachinePriceProvenance / OfferQualitySignals
Machine pending write   → insertIngestedOffer ONLY
Author                  → resolveBotAuthorUserId (+ assertDedicatedMachineAuthor staging)
Moderation              → pending → approved|rejected (human)
Distribution            → only after approved; engine OFF by default
Settlement / Rewards    → OFF; S9 must not touch
```

## Alternate writers (classified)

| Writer | Class | S9.1 |
|--------|-------|------|
| `app/api/offers/route.ts` | UGC human | Untouched |
| `runIngestCycleForProfile` | Legacy cron | **Discovery-only** — no mint |
| `processExternalWorkerBatch` | S6.7 gated | Same kill-switch + in-function auth |
| distribution e2e harness | Test-only | Untouched |

**Canonical mint:** S9 → `withMachinePendingWritesEnabled` → `writePendingViaS7Bridge` → `insertIngestedOffer` (pending only).  
See `docs/SYSTEMS/S91_SUPPLY_WRITE_AUTHORITY_REPORT.md`.


## Pipeline

```
HunterResult
  → hunterCandidateToS8Input
  → opportunityCandidateFromHunterHandoff
  → evaluateOpportunity (S8)
  → evaluateSupplyPolicy (S9 policy)
  → SupplyDecision
  → [if ELIGIBLE && execute && gates]
       withMachinePendingWritesEnabled
         → writePendingViaS7Bridge
           → insertIngestedOffer (status pending)
  → Moderation (human)
```

## SupplyDecision reason codes

`ELIGIBLE` | `REJECTED` | `SUPPRESSED` | `DUPLICATE` | `BUDGET_REJECTED` |
`INVALID_PROVENANCE` | `LOW_QUALITY` | `RISK_REJECTED` | `WRITE_BLOCKED` |
`S8_FAILURE` | `MALFORMED_INPUT` | `S9_DISABLED` | `S7_WRITES_DISABLED` |
`INVALID_CONFIG` | `INVALID_AUTHOR` | `PRODUCTION_BLOCKED`

## Flags

| Flag | Default | Role |
|------|---------|------|
| `SUPPLY_AUTOMATION_ENABLED` | false | S9 runtime gate |
| `BOT_INGEST_MACHINE_PENDING_WRITES` | false | S7 write kill switch |
| `BOT_INGEST_ENABLED` | config | ingest master |
| `DISTRIBUTION_ENGINE_ENABLED` | false | untouched by S9 |
| `SETTLEMENT_BRIDGE_ENABLED` | false | untouched |
| `REWARDS_PROGRAM_ACTIVE` | false | untouched |
| `COMMISSION_PROGRAM_ACTIVE` | false | untouched |
| `MONEY_PATH_FROZEN` | prod fail-closed | untouched |

## Caps (server-authoritative)

- `S9_MAX_CANDIDATES_PER_RUN` (default 20, hard max 50)
- `S9_MAX_WRITES_PER_RUN` (default 5, hard max 5 — aligns S6.7 canary)
- `S9_MAX_WRITES_PER_SOURCE` (default 3)
- CLI `--cap` may only **lower** server caps, never raise

## S9→S7 adapter contract

```
buildParsedMetaFromOpportunity(...) → ParsedOfferMetadata
writePendingViaS7Bridge(meta, config, opts) → InsertIngestResult
```

Must:
- call `insertIngestedOffer` only
- require `isMachinePendingWriteEnabled()` before write (or be inside `withMachinePendingWritesEnabled`)
- never set status `approved` from S9
- preserve provenance in signals / bot_meta

## Blockers identified (Phase 0)

1. No public single-insert API — bridge wraps `insertIngestedOffer` (deep import OK; no second writer)
2. Type gap OpportunityCandidate ↔ ParsedOfferMetadata — bridge owns mapping
3. Legacy `runIngestCycleForProfile` diverges — **forbidden** for S9

## Implementation status (Wave 2)

| Path | Status |
|------|--------|
| `lib/supply/policy/**` | Implemented |
| `lib/supply/automation/**` | Implemented |
| `lib/supply/s7Bridge/**` | Implemented |
| `tests/supply/s9/**` | Implemented |
| `scripts/s9-staging-canary.ts` | Dry-run verified; `--execute` staging-only |
| Docs (architecture / runbook / audit) | Written |

Worktrees at `d06a026`: `agent/s9-{orchestrator,policy,s7-adapter,canary,audit}`. Canonical code on **staging**.

## Non-goals

- Continuous automation / cron activation
- ChatGPT/Grok live DB wiring
- Distribution / Rewards / Settlement activation
- Production canary
