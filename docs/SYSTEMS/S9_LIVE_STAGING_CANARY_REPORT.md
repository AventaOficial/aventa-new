# S9 LIVE STAGING CANARY REPORT

**Verdict: PASS**

Campaign: `S9_LIVE_STAGING_CANARY`  
Run ID: `s9-live-1789797653771`  
At: `2026-09-19T06:01:10.374Z`  
Artifact: `scripts/_s9_reports/s9-live-staging-canary-latest.json`

---

## 1. Target

- Branch: `staging`
- Checkpoint base: `d06a026625e67f5dc162edf2b45a4c2baef83f9a`
- `AVENTA_SUPABASE_TARGET=staging`
- Production runtime: **false**

## 2. Supabase ref

- Connected: `oojshofrpbfwsiypcecr` (staging)
- Expected: `oojshofrpbfwsiypcecr`
- Production ref (untouched): `mkgsrpsuvedwwlzmzmzh`

## 3. Author

| Field | Value |
|-------|--------|
| id | `778cfbf5-294e-4866-883f-71e3046566cb` |
| role | `user` |
| display_name | Aventa Machine Supply (staging) |
| username | aventa_machine_supply |
| seed/admin | **NO** (≠ `6aa733d4-…`) |

## 4. Baseline → after

| Surface | Baseline | After live | Δ |
|---------|----------|------------|---|
| offers | 23 | 25 | **+2** |
| pending | 14 | 16 | **+2** |
| approved | 9 | 9 | 0 |
| rejected | 0 | 0 | 0 |
| distribution_publications | 15 | 15 | **0** |
| distribution_events | 108 | 108 | **0** |
| creator_rewards | 0 | 0 | **0** |
| reward_outbound_clicks | 1 | 1 | **0** |
| economic_ledger | 0 | 0 | **0** |
| affiliate_ledger | 0 | 0 | **0** |
| attribution_events | 0 | 0 | **0** |
| affiliate_conversions | 0 | 0 | **0** |
| affiliate_commissions | 0 | 0 | **0** |

N/A tables: none.

## 5. Candidate funnel

- Cap: **2** (hard ≤5)
- candidates_seen: 2
- evaluated: 2
- eligible: 2
- suppressed / duplicate / budget / provenance / quality: 0

Pipeline: `HunterResult` → S8 `evaluateOpportunity` → S9 policy → S7 bridge.

## 6. Dry-run

- 2× `ELIGIBLE` / S8 `OPPORTUNITY` score 94
- write_attempted: 0
- Fingerprints: `ml:MLM97653772`, `ml:MLM97653773`

## 7. Live result

- dry/live `decisionFingerprint`: **MATCH**
- write_attempted: 2
- write_success: 2
- Sole writer: `insertIngestedOffer` via `withMachinePendingWritesEnabled`

## 8–13. Exact offers

### Offer A
- **offer_id:** `6878cebd-e636-4ec8-ae7b-eba7ae146450`
- **fingerprint:** `ml:MLM97653772`
- **status:** `pending`
- **created_by:** `778cfbf5-294e-4866-883f-71e3046566cb`
- **URL:** present (canonical)
- **image:** present
- **source:** `s9_supply_automation` / `aventa_supply:s9_live_canary_fixture`
- **provenance:** `originalPriceProvenance=listing_card`, `cardDiscountSource=card_strikethrough`
- **S8:** OPPORTUNITY / 94
- **S9:** ELIGIBLE (`s8_opportunity`, `policy_pass`)
- **locked_by:** null (moderation boundary intact)
- **bot_meta:** present (`dealQuality.recommendedAction=HUMAN_REVIEW`)

### Offer B
- **offer_id:** `7fb72be0-c68e-4663-bafb-e38f5a7b48fe`
- **fingerprint:** `ml:MLM97653773`
- **status:** `pending`
- **created_by:** `778cfbf5-294e-4866-883f-71e3046566cb`
- Same provenance / S8 / S9 pattern as A

## 14. Cap

Server hard max 5; canary cli cap 2; writes = 2 ≤ cap.

## 15. Idempotency retry

- Re-ran offer A identity
- Result: `DUPLICATE` / `pending_fresh`
- `secondInsertCreated: false`
- `rowsForFingerprint: 1`
- Retry deltas: all **0**

## 16–20. Downstream deltas

Distribution **0** · Attribution **0** · Rewards **0** · Economy **0**

## 21. Production firewall

Connected only to staging ref. Production ref never used. `isProductionRuntime()=false`.

## 22. Final flags (verified physically)

| Flag | Final |
|------|--------|
| SUPPLY_AUTOMATION_ENABLED | OFF (unset) |
| BOT_INGEST_MACHINE_PENDING_WRITES | OFF |
| DISTRIBUTION_ENGINE_ENABLED | false |
| SETTLEMENT_BRIDGE_ENABLED | false |
| REWARDS_PROGRAM_ACTIVE | false |
| COMMISSION_PROGRAM_ACTIVE | false |
| MONEY_PATH_FROZEN | true |

## 23–25. Validation

| Check | Result |
|-------|--------|
| `npx vitest run tests/supply/s9` | **28 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |

No S9-related failures. Unrelated suite not re-run in this phase (prior Wave full suite was 2226 PASS).

## 26. Git status

Branch: `staging` @ `d06a026`  
Untracked S9 modules/docs/canary artifacts. **No push.** Flags process-scoped OFF.
## 27. Remaining risks

1. Canary used HunterResult fixture with listing-card signals (still through S8/S9 — not a second scorer). Live hunter adapters (ChatGPT/Grok) not wired to DB.
2. Pending offers await human moderation — Distribution must stay OFF until explicit next campaign.
3. Do not enable continuous cron / permanent `SUPPLY_AUTOMATION_ENABLED`.

## 28. Next architectural boundary

Human moderation of S9 pending → (future, separate decision) controlled Distribution canary. **Outside S9.** STOP here.
