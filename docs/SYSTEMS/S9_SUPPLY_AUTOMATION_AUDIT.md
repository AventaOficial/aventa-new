# S9 Supply Automation — Independent Architecture Audit (S9-E)

Auditor role: docs-only review. No production code mutations by this agent.

Date: 2026-09-18  
Base checkpoint: `d06a026`

## Verdict

**CONDITIONAL PASS** — core boundaries are correctly designed. Integration may proceed after tests/typecheck/build green and staging canary evidence. Do **not** enable continuous automation.

## Authorities preserved

| Authority | Owner | S9 compliance |
|-----------|-------|---------------|
| Opportunity evaluation | S8 `evaluateOpportunity` | Consumed, not reimplemented |
| Machine pending write | `insertIngestedOffer` | Sole writer via `s7Bridge` |
| Write activation | `withMachinePendingWritesEnabled` | Execute path only |
| Duplicate | `findDuplicateOfferByUrl` + in-run URL set | Reused |
| Author | `resolveBotAuthorUserId` + `assertDedicatedMachineAuthor` | Staging enforced |
| Moderation | pending → human | status never `approved` from S9 |
| Distribution / Rewards / Settlement | separate flags OFF | Untouched |

## Duplicate writer scan

Alternate writers remain classified (UGC API, legacy `runIngestCycleForProfile`, e2e harness). S9 does not call them.

## Caps

Server-side caps with hard ceilings; CLI `--cap` only lowers. Fail-closed on invalid env.

## Idempotency

In-run canonical URL de-dupe + S7 `findDuplicateOfferByUrl` / UNIQUE fingerprint. Same opportunity twice → one write attempt; second → `DUPLICATE`.

## Provenance

Policy rejects missing sale price, missing image, untrusted reference, artificial list price, fabricated discount. Bridge refuses to invent image/URL.

## Production firewall

`isProductionRuntime()` → `PRODUCTION_BLOCKED` before writes.

## Flags

`SUPPLY_AUTOMATION_ENABLED` default false. S9 ON + S7 OFF → no write. Downstream systems not activated.

## Residual risks / blockers

1. Staging canary with real DB still required for live N≤5 proof (author, pending row, retry).
2. Hunter fixtures without trusted card provenance will correctly fail `INVALID_PROVENANCE` / S8 PARTIAL — operators must not bypass by fabricating signals in production paths.
3. Do not merge worktree branches that rewrite `drain.ts` / `reclaim.ts` / settlement M1-M2 / attribution.

## Next architectural boundary

Human moderation of S9-authored pending offers → (future) controlled Distribution canary — **outside S9**. S9 stops at machine pending insert.
