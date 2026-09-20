# WAVE 3 — Seam Architecture Audit (Phase 0)

**Date:** 2026-09-19  
**Branch:** staging @ `d06a026` (+ uncommitted S9)  
**Mode:** reconnaissance only — no corrections in this phase.

## Pipeline map & transition authorities

```
HunterResult (S8.1 normalizeHunterResult)
  → [contract] hunterCandidateToS8Input / opportunityCandidateFromHunterHandoff
S8 evaluateOpportunity
  → [contract] SupplyDecision via evaluateSupplyPolicy
S9 runSupplyAutomation
  → [contract] writePendingViaS7Bridge
S7 insertIngestedOffer (offers.status=pending)   ★ sole machine writer
  → [contract] human moderate-offer (CAS pending→approved|rejected)
Moderation
  → [contract] enqueueDistributionForApprovedOffer (DISTRIBUTION_ENGINE_ENABLED)
Distribution drain/claim/publish (C3 UNKNOWN_OUTCOME preserved)
  → [contract] hop / track-outbound → recordAttributedClick
Click (reward_outbound_clicks)
  → [contract] resolveConversionAttributionStrict
Attribution
  → [contract] recordConversion
Conversion (affiliate_conversions)
  → [contract] recordCommission
Commission (affiliate_commissions)
  → [contract] settleCommission (SETTLEMENT_BRIDGE + MONEY_PATH_FROZEN)
Settlement → affiliate_ledger_entries
  → [OUT OF WAVE3 E2E] createRewardFromLedgerEntry (REWARDS_PROGRAM_ACTIVE)
Rewards
```

| Transition | Canonical authority | Must NOT |
|------------|---------------------|----------|
| Hunter→S8 | `fromHunterHandoff` / S8 evaluate | Trust hunter list price; write offers |
| S8→S9 | `evaluateSupplyPolicy` | Second scorer |
| S9→S7 | `writePendingViaS7Bridge` → `insertIngestedOffer` | Second writer; status=approved |
| S7→Moderation | pending queue + `moderate-offer` | Auto-approve from S9 |
| Mod→Dist | `enqueueDistributionForApprovedOffer` | Enqueue pending/rejected |
| Dist→Click | `recordAttributedClick` via hop/track | Client-controlled offer identity as SoT |
| Click→Attr | `resolveConversionAttributionStrict` | Invent click |
| Attr→Conv | `recordConversion` | Ledger/rewards |
| Conv→Comm | `recordCommission` | Set ledger_entry_id |
| Comm→Settle | `settleCommission` | createReward |

## Writer inventory (classified)

### offers
| Writer | Class |
|--------|-------|
| `insertIngestedOffer` | **Canonical machine** |
| `POST /api/offers` | **Canonical UGC** (always pending) |
| `writePendingViaS7Bridge` | Wrapper → machine (not second) |
| `runIngestCycle` → insertIngestedOffer | Legacy cron path — **does not** check MACHINE_PENDING_WRITES |
| `moderate-offer` | **Canonical status** approve/reject |
| expire/demote/lock/delete | Operational alternates |

### distribution_publications
| Writer | Class |
|--------|-------|
| `enqueueDistributionForApprovedOffer` | **Canonical enqueue** |
| `claim` / `drain` / `reclaim` | Lifecycle (C3 reclaim semantics must preserve) |
| `appendDistributionEvent` | Append-only events |

### reward_outbound_clicks
| Writer | Class |
|--------|-------|
| `recordAttributedClick` | **Canonical** |
| `recordOutboundClick` | Legacy wrapper → canonical |

### affiliate_conversions / affiliate_commissions
| Writer | Class |
|--------|-------|
| `recordConversion` / `recordCommission` | **Canonical** |
| `settleCommission` CAS link | Settlement only |

### affiliate_ledger_entries
| Writer | Class |
|--------|-------|
| `settleCommission` | **Canonical settlement bridge** |
| admin affiliate-ledger / CSV | Manual ops alternate |
| **economic_ledger** | **No writers in codebase** |

### creator_rewards
| Writer | Class |
|--------|-------|
| `createRewardFromLedgerEntry` | **Canonical** (OUT of Wave3 E2E) |

## Critical bypass risks (do not “fix” away)

1. **`BOT_INGEST_AUTO_APPROVE` default ON** on legacy cron — can skip human moderation and fire distribution enqueue.
2. **`runIngestCycle` inserts without `MACHINE_PENDING_WRITES`** — parallel machine path vs S9/externalWorker.
3. **UGC offers API** — pending without S8/S9 (acceptable dual SoT; must not be used by Wave3 harness as “S9 path”).
4. **Conversion without click** can persist as `unattributed` — money foundation advances; rewards should still block.
5. **Distribution fire-and-forget** after approve — approve succeeds even if enqueue fails.
6. **Admin ledger CSV** can create ledger outside settlement bridge.
7. **Process-scoped machine writes left ON** opens inserts for any caller that does not re-check (S9 bridge does check).

## Flags (defaults fail-closed unless noted)

| Flag | Default | Seam |
|------|---------|------|
| `SUPPLY_AUTOMATION_ENABLED` | OFF | S9 |
| `BOT_INGEST_MACHINE_PENDING_WRITES` | OFF | S7 write |
| `BOT_INGEST_ENABLED` | OFF | Legacy ingest |
| `BOT_INGEST_AUTO_APPROVE` | **ON** (legacy risk) | Moderation bypass |
| `DISTRIBUTION_ENGINE_ENABLED` | OFF | Dist enqueue |
| `SETTLEMENT_BRIDGE_ENABLED` | OFF | Settlement |
| `MONEY_PATH_FROZEN` | prod frozen if unset | Money |
| `REWARDS_PROGRAM_ACTIVE` | OFF | Rewards |
| `COMMISSION_PROGRAM_ACTIVE` | OFF | Legacy hunters program |

## Production firewall

- Staging ref: `oojshofrpbfwsiypcecr`
- Production ref: `mkgsrpsuvedwwlzmzmzh` — **never write**
- S9 / settlement canaries / distribution drain: staging-gated
- Wave3 harness must abort if target ≠ staging or ref ≠ staging

## Non-goals of Wave3

- New business features
- New tables (unless proven architectural necessity — none identified for contracts)
- Second writers
- Continuous cron
- Rewards / payouts in E2E
- Telegram production
- Changing C3 reclaim, S7 insert, Attribution, or Settlement semantics

## Phase 0 verdict

**Proceed to seam contracts + failure matrix.**  
Documented risks above are **known architectural debt** — Wave3 must *detect* them in tests, not silently “fix” by enabling auto-approve or legacy ingest.
