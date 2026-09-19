# S7.1 — Staging Write Activation

## 1. Staging environment

| Field | Value |
|---|---|
| `AVENTA_SUPABASE_TARGET` | `staging` |
| Project ref | `oojshofrpbfwsiypcecr` |
| `AVENTA_EXPECTED_SUPABASE_REF` | match OK |
| Branch / HEAD | `staging` @ `aae75c5` (pre-master checkpoint) |
| Production URL | **not used** |
| Execution mechanism | existing `scripts/s67-machine-insert-canary.ts --execute --cap=3` |
| Cron / GHA mutation | **none** |
| Vercel env mutation | **none** |

Evidence: `scripts/_s71_reports/` + `scripts/_s67_reports/s67-report-1789784581668.json`

## 2. Author used

| Field | Value |
|---|---|
| Author UUID | `6aa733d4-02cb-4c64-92fc-cf45fdcee344` |
| Profile | `display_name=fet_tx`, `role=admin` |
| Auth user | exists |
| Dedicated TECH/STAPLES bot UUIDs | **absent** in staging (confirmed lookup: no bot-like profiles) |
| Mechanism | S6.7 seed author (same as prior canaries). Process-scoped via canary; not permanent `.env.local` |

No fictitious UUID invented. No production Auth user created.

## 3. Configuration state

| Flag | Before | During canary | After |
|---|---|---|---|
| `BOT_INGEST_ENABLED` | unset (local) | `1` process-scoped | restored / unset |
| `BOT_INGEST_USER_ID` | unset | seed author process-scoped | restored / unset |
| `BOT_INGEST_MACHINE_PENDING_WRITES` | **OFF** | **ON only inside** `withMachinePendingWritesEnabled` | **OFF** (`flagAfter: false`) |
| `WORKER_DISCOVERY_ONLY` | N/A (canary bypasses GHA) | N/A | unchanged |
| `DISTRIBUTION_ENGINE_ENABLED` | unset → OFF | OFF | OFF |
| Rewards / Economy / Attribution / Telegram | not activated | not activated | not activated |

## 4. Candidate count

| Metric | Value |
|---|---|
| Discovery fixture pool | 15 |
| Dry WOULD_INSERT | 15 |
| Eligible non-duplicate for canary | 10 |
| Selected (cap) | **3** |

Selected fingerprints:

1. `ml:MLM74850561`
2. `ml:MLM63723900`
3. `ml:MLM67977902`

Dry quality for all three: `VERIFIED_OPPORTUNITY` · provenance `listing_card`.

## 5. Cap

`canaryCap = 3` (hard ceiling 5). Never exceeded.

## 6. Attempted

| Metric | Value |
|---|---|
| Live candidates posted | 3 |
| Write attempts | 3 |

## 7. Inserted

| # | offer_id | fingerprint | status |
|---|---|---|---|
| 1 | `2af71ce8-1dfa-4c6f-ba59-242da382370e` | `ml:MLM74850561` | pending |
| 2 | `29d3a499-c76b-4bd0-8a33-47b3d4b8f228` | `ml:MLM63723900` | pending |
| 3 | `8c92bbcf-f411-4226-8523-0ea06d880ea2` | `ml:MLM67977902` | pending |

Surface delta: `offersTotal +3`, `offersPending +3` (6 → 9 pending).

Each row verified with: fingerprint, URL, sale price, original price, image, `bot_meta` (`source=ml_worker`, `gateAction=insert_pending`, `originalPriceProvenance=listing_card`, `currentPriceProvenance=source_explicit`), `[bot-ingest v3]` moderator comment.

Dry↔live equivalence: **3/3 ok** (`VERIFIED_OPPORTUNITY` → live `inserted`).

## 8. Skipped

0 (live batch).

## 9. Failed

0.

## 10. Duplicate behavior

Idempotency retry on soldadora (`ml:MLM63723900`):

- result: `duplicate` / `duplicateKind: pending_fresh`
- `secondInsertCreated: false`
- no new `offers` row

## 11. Focus claim/release result

| Field | Value |
|---|---|
| preferOfferId | `2af71ce8-1dfa-4c6f-ba59-242da382370e` |
| claimed | **true** (`claimKind: fresh`) |
| released | **true** |
| claimable | **true** |
| post-release `locked_by` | null |
| auto-approve / publish | **none** |

Handoff proven: Machine Supply → `offers.pending` → Focus claimable → releaseable.

## 12. Distribution delta

| Surface | Δ this campaign |
|---|---|
| `distribution_publications` | **0** |
| `distribution_events` | **0** |
| `distribution_destinations` | **0** |

## 13. Rewards delta

Canary code path does not call Rewards writers.

Post-canary readable counts:

- `creator_rewards`: count unavailable (`null`, no error message)
- `reward_outbound_clicks`: total **1** (no campaign-specific before snapshot for this table — **Δ not claimed**)

No Rewards activation performed.

## 14. Economy delta

- `affiliate_ledger_entries` / `affiliate_conversions` / `affiliate_commissions`: count unavailable (`null`)
- No Economy activation / commission writes performed by canary

## 15. Attribution delta

- Attribution tables not written by canary path
- `reward_outbound_clicks` total post=1 (see §13 — Δ not claimed without before)
- No Attribution activation

## 16. Final feature flag state

| Flag | Final |
|---|---|
| `BOT_INGEST_MACHINE_PENDING_WRITES` | **OFF** |
| `DISTRIBUTION_ENGINE_ENABLED` | **OFF** |
| GHA `WORKER_DISCOVERY_ONLY` default | still **1** (unchanged) |
| Permanent staging Vercel writes | **not enabled** |

## 17. Exact remaining blockers

1. **Dedicated machine bot author** still absent in staging (seed admin `fet_tx` reused). Prefer provisioning TECH/STAPLES (or a single bot Auth user) before continuous ops.
2. **Continuous pending supply** still blocked operationally: GHA discovery-only default + global writes OFF (by design). S7.1 proved the write path; it did **not** open production/staging continuous writes.
3. Optional: persist `BOT_INGEST_ENABLED` + bot author in **staging** Vercel env only when ops intentionally wants non-canary ingest (still keep writes OFF except canary/`withMachinePendingWritesEnabled`).
4. Price-history table `product_price_snapshots` missing on staging (warnings only; did not block inserts).

## Artifacts

- Canary report: `scripts/_s67_reports/s67-report-1789784581668.json` (also `s67-report-latest.json`)
- Preflight: `scripts/s71-staging-preflight.ts`
- Offer proof: `scripts/_s71_reports/s71-offer-proof-latest.json`
- Surface snaps: `scripts/_s71_reports/s71-snap-*-latest.json`
