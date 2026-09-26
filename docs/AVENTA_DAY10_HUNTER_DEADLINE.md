# AVENTA — DAY 10 Hunter Deadline Isolation

## Problem (production Day 9)

Cycle `continuous-2026-09-25-19` completed with:

- `phase=complete`
- `discovered=0` / DQE / S6.1 all zero
- `by_source.hunter_collect` → `FAILED` + `soft_deadline`

Root cause: `runHunterCollect` raced against the **full** soft deadline (180s). Sticky near-ready and PM evidence-backed never ran because they were gated on `!pastDeadline()` after hunter drained the wall clock.

This was **not** a DQE, S6.1, PM, lease, or mint failure.

## Prior architecture

```
soft deadline (180s)
 └─ Promise.race(runHunterCollect, softDeadline)  // consumed ~100%
 └─ sticky/pm only if !pastDeadline()             // skipped silently
 └─ enrich loop
 └─ persist / watchdog
```

## Day 10 architecture

Central `DeadlineContext` (`lib/hunter/discovery/deadlineBudget.ts`):

- `startedAt` / `deadlineAt`
- `remainingMs()` / `hasTimeFor(minMs)` / `isExpired()`
- `allocate(stage, requestedMs)` — clamps by stage cap, remaining time, and **persist reserve**
- `recordUsed` / `snapshot` for durable observability

Stage caps (within the same 180s soft wall — total soft deadline **unchanged**):

| Stage | Cap |
|-------|-----|
| near_ready_measure | 10s |
| hunter_collect | **75s** |
| sticky_pm | 35s |
| enrich_eval | 45s |
| persist (reserved) | 15s |

Hunter cannot be granted the persist reserve. Soft deadline wall stays `SCHEDULED_CONTINUOUS_DEADLINE_MS`.

## Hunter behavior

`runHunterCollect` accepts `budgetMs` + optional `AbortSignal`:

- Stops before the next source when budget expires
- Returns **partial** candidates already found
- Sets `stoppedReason: 'soft_deadline'`
- Source rows use `errorCode: soft_deadline` → canonical **`SKIPPED`** (not cycle FAILED)

Outer `raceWithBudget` still bounds wall time if a single source hangs.

## Source isolation

After hunter soft_deadline:

- Sticky near-ready still runs if cycle budget remains
- PM evidence-backed still runs within the sticky_pm slice
- Candidates still pass identity → Offer Standard → DQE → S6.1 → S7 (unchanged)
- No forced VERIFIED; no POTENTIAL→VERIFIED; dry-run stays dry-run

## Metrics

`DiscoveryCycleReport.deadlineBudget` snapshots:

- granted/used ms per stage
- remainingMs / expired
- `endedBy: normal | deadline`

Funnel still distinguishes SUCCESS / SKIPPED / FAILED / BLOCKED_* / NO_RESULTS via Day 6 taxonomy; soft_deadline is SKIPPED + errorCode.

## Invariants

- cronSafe dry-run / mint OFF
- DQE / S6.1 / sole writer / UNIQUE cycle_id lease unchanged
- MONEY_PATH_FROZEN / machine mint / rewards path not modified
- Soft deadline not increased; Vercel `maxDuration` still 300s

## Tests

`tests/hunter/discovery/day10DeadlineIsolation.test.ts` — budget math, race helper, taxonomy, wiring, sole writer, dry-run automation.

## Risks

- Hunter work may continue briefly after abort (no mid-source cancel inside retailer scrapers)
- Sticky still needs DB latency within its slice
- Yield may remain low if sticky/PM pools lack Ready history — that is quality truth, not a timeout bug

## Next steps

1. Staging/production canary: expect sticky/pm source rows even when hunter soft_deadline
2. Optionally cooperative cancel inside slow `source.collect` implementations
3. Only then consider Pro hourly cron — not required for Day 10
