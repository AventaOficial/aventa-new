# WAVE 3 — Seam Contracts

Contracts live in `lib/wave3/seams/contracts.ts`.  
They **delegate** to canonical authorities. They do **not** create second writers or tables.

| Seam | Contract fn | Authority called | Identity preserved | Fail-closed |
|------|-------------|------------------|--------------------|-------------|
| S8→S9 | `seamS8toS9` | `evaluateOpportunity` + `evaluateSupplyPolicy` | url, fingerprint, s8 decision/score | malformed / S9 off / production |
| S9→S7 | `seamS9toS7` | `writePendingViaS7Bridge` → `insertIngestedOffer` | url, offerId, pending only | NOT_ELIGIBLE / WRITE_BLOCKED / INVALID_AUTHOR |
| S7→Mod | `seamS7toModeration` | `applyHarnessModerationDecision` (CAS pending) | offerId, status | already_moderated / cas_lost |
| Mod→Dist | `seamModerationToDistribution` | `enqueueDistributionForApprovedOffer` | offerId | flag_disabled / not_distributable / **REWARDS_ENABLED_FORBIDDEN** |
| Dist→Click | `seamDistributionToClick` | `recordAttributedClick` | offerId, clickId | missing offer_url |
| Click→Conv | `seamClickToConversion` | `resolveConversionAttributionStrict` + `recordConversion` | clickId, offerId, conversionId, attribution | invent click forbidden; source must be valid `EconomicIngestSource` |
| Conv→Comm | `seamConversionToCommission` | `recordCommission` | conversionId, commissionId, ledger=null | rewards enabled forbidden |
| Comm→Settle | `seamCommissionToSettlement` | `settleCommission` | commissionId, ledgerEntryId | SETTLEMENT_DISABLED / MONEY_PATH_FROZEN / no rewards |

## Diagnostics

Every seam returns `SeamDiagnostic` with `{ seam, ok, code, identity, notes }` — no secrets, no raw HTML, no tokens.

## Known contract fix during Wave3

Invalid ingest source `csv_manual` silently returned `null` from `recordConversion` (fail-closed).  
Corrected to `manual` (canonical `ECONOMIC_INGEST_SOURCES`).

## Guards

`assertWave3StagingOnly` / `restoreWave3FailClosedFlags` in `lib/wave3/guards.ts`.
