# WAVE 3 — Failure Matrix

Catalog: `lib/wave3/failureMatrix.ts` (27 scenarios).  
Tests: `tests/integration/wave3/failureMatrix.test.ts`.

| # | Scenario | Evidence layer | Result |
|---|----------|----------------|--------|
| 1 | duplicate candidate | S9 automation mock | PASS — 2nd DUPLICATE |
| 2 | duplicate S9 execution | S9 automation mock | PASS — one write |
| 3 | concurrent S9 | S9 parallel execute | PASS — ≤1 success |
| 4 | crash before S7 write | injected throw | PASS — WRITE_BLOCKED, 0 success |
| 5 | stale retry | second execute | PASS — DUPLICATE |
| 6 | pending bypass | dist memory e2e | PASS — not eligible |
| 7 | rejected bypass | dist memory e2e | PASS — not eligible |
| 8 | duplicate dist enqueue | dist success circuit | PASS — no forbidden tables |
| 9 | concurrent claim | dist memory e2e | PASS — ≤1 winner |
| 10–12 | provider fail/timeout | controlled adapter | PASS |
| 13–14 | lost ACK / UNKNOWN recovery | C3 harness | PASS — offer untouched |
| 15–18 | click/attr invariants | contract + policy | PASS (unit); staging click live PASS |
| 19–23 | money replay gates | flags + UNIQUE design | PASS (unit); **staging schema BLOCKED** |
| 24 | production target | `assertWave3StagingOnly` | PASS — abort |
| 25 | rewards accidentally ON | Mod→Dist seam | PASS — REWARDS_ENABLED_FORBIDDEN |
| 26–27 | settlement/dist left ON | `restoreWave3FailClosedFlags` | PASS — all OFF + money frozen |

## Forbidden side effects verified

- No Telegram production HTTP in harness
- No C3 semantic change
- No second offer writer
- No creator_rewards from settlement path
- Flag restore after canaries
