# Aventa — Launch Readiness Ledger

Single source of truth for launch readiness. Every status must cite evidence.
Statuses: NOT_STARTED · IN_PROGRESS · BLOCKED · READY_FOR_PRODUCTION · VERIFIED · GO · NO_GO.

- Production: Supabase `mkgsrpsuvedwwlzmzmzh`, Vercel production (branch `master`).
- Staging: Supabase `oojshofrpbfwsiypcecr`.
- Ledger opened: 2026-10-04 (Phase 0). Last update: see git history of this file.

## Phase 0 baseline (2026-10-04, read-only)

Production counts: offers 654 (pending 1), profiles 18, offer_events 404, reward_outbound_clicks 11,
affiliate_ledger_entries 10, affiliate_conversions 0, creator_rewards 6, reward_payouts 6,
moderation_logs 446, moderation_outcomes 695, offer_votes 17, comments 1, team_memberships 0,
pending account deletions 0.

Production cron: Supabase pg_cron has only `daily-process-offers-lifecycle` (inactive, frozen by
`20261004170952:offers_lifecycle_freeze`). All other jobs run as Vercel Cron (`vercel.json`, 16 routes).

### Schema parity (catalog fingerprint, public + maintenance schemas)

Staging 1631 objects, production 1007. Staging is **not** a replica of production:

- Staging-only legacy objects: `ofertas`, `votos`, `moderation_log`, `user_roles_tbl`, `stores`,
  `merchants`, `payouts`, `ui_events*`, `site_settings*`, 19 compatibility views, 6 pg_cron jobs,
  storage buckets `ofertas`, `ofertas-images`.
- Production-only: `affiliate_commission_revisions`, `affiliate_reconciliation_runs/findings`,
  `community_offers`, `hunter_shadow_cycles/outcomes`, `hunter_source_health`, `ingest_cycle_locks`,
  `mercadolibre_oauth_tokens`, `offer_price_snapshots`, `offer_quality_checks`,
  `reward_clawback_adjustments`, view `offer_performance_metrics`.
- Consequence: staging validation is evidence for behaviour of the objects under test, not for
  whole-database parity. Every production migration needs a production dependency precheck.

### Code → production schema missing (`.from()` / `.rpc()` in app/ and lib/)

| Missing in production | Used by | Resolution |
|---|---|---|
| `offer_lifecycle_runs`, `reject_pending_offers_bulk` | integrity, bot-queue endpoint | M1 |
| `offer_freshness_scan_state`, `product_events`, `account_deletion_audit`, `search_public_offers`, `profiles.deletion_*`, `offer_health_state.next_check_at…`, `offers.search_document` | scanner, analytics, account purge, search | M3 |
| `offers.archived_at`, `offers.archive_reason` | lifecycle, integrity | M1 |
| `coupons`, `coupon_links`, `coupon_events`, `coupon_interactions` | admin coupons, coupon intelligence | Phase 7 decision |
| `distribution_publications/destinations/events` | distribution engine | Phase 7: disabled state, no migration |
| `intelligence_shadow_decisions`, `price_intelligence_rollups`, rpc `demand_offer_signals` | admin intelligence endpoints | Phase 12: graceful not-enabled state |

### Security baseline (production)

- SECURITY DEFINER functions without `search_path`: 0. SECURITY DEFINER executable by `anon`: 0.
- RLS enabled without policies but with default anon/authenticated grants (deny-all through RLS,
  least-privilege debt): `offer_health_state`, `commission_allocations`, `commission_pools`,
  `communities`, `community_offers`, `affiliate_ledger_entries`.
- Money path: `lib/server/moneyPathFreeze.ts` fails closed in production (`MONEY_PATH_FROZEN`
  absent/invalid → frozen). Money crons call it (`processExpiredRewardHolds`, bridge, payout intent,
  provider confirmation).

## Ordered production migration plan (Phase 1 output)

Nothing below is applied automatically. Each step requires: checksum of the reviewed file, production
dependency precheck, expected row counts, lock analysis, rollback/forward note, post-check.

| # | Step | Depends on | Locks / traffic | Rollback / forward | Post-checks |
|---|---|---|---|---|---|
| 1 | M1 `offers_lifecycle_v2.sql` (archive columns, lifecycle runs, audited bulk reject RPC; job created **inactive**) | freeze in place | `ALTER TABLE offers ADD COLUMN` (nullable, no default rewrite): brief ACCESS EXCLUSIVE | forward-only additive; job stays inactive | columns/RPC exist; job inactive; counts unchanged |
| 2 | Deploy code (`launch/lifecycle-v2` → `master`) | M1 (scanner UPDATE guards use `offers.archived_at`) | none | Vercel instant rollback | build ok; smoke; integrity run |
| 3 | Manual lifecycle run (dry count first) | M1 + code | short row locks on ≤ batch | run log in `offer_lifecycle_runs` | expected: 9 orphan locks cleared, 5 rejected archived, 0 deletes |
| 4 | Enable `offers-lifecycle-v2` (`offers_lifecycle_v2_enable.sql`) | step 3 clean | none | `cron.alter_job(active := false)` | next run recorded; old job still inactive |
| 5 | M2 `offers_evidence_protection.sql` (RESTRICT FKs + append-only triggers) | step 4 | FK re-create: SHARE ROW EXCLUSIVE on child tables; low-traffic window | drop new constraints/triggers (documented) | evidence counts unchanged; delete attempt rejected |
| 6 | M3 `launch_hardening_v2.sql` (freshness queue, product_events, account deletion incl. hold, search RPC, ACL hardening) | step 5 | `offers.search_document` added nullable + trigger; one backfill `UPDATE … WHERE search_document IS NULL` (654 rows, row locks only, `updated_at` untouched); GIN index built non-concurrently on a small table | additive; functions replaceable | purge dry run; search RPC; ACL probes |

Between steps 2 and 6 the account-purge cron keeps failing exactly as it does today (no requests
pending: 0); it starts working at step 6.

## Domain matrix

| Domain | Production | Staging | Repo / schema | Known issues (severity) | Required action | Tests | Status |
|---|---|---|---|---|---|---|---|
| Database | 1007 objects; M1/M2/M3 absent | M1/M2/M3 applied | 136 files in docs/supabase-migrations, applied ad hoc | Large staging/prod drift (P1 process) | Ordered plan; prod prechecks per migration | parity diff | IN_PROGRESS |
| Lifecycle | Destructive job frozen (inactive) | v2 hourly, validated | M1 + enable | Destructive deletion (P0, contained by freeze) | Roll out M1 → code → manual run → enable | staging suite (report 2026-10-04) | READY_FOR_PRODUCTION |
| Evidence | CASCADE/SET NULL from offers | RESTRICT + append-only | M2 | Evidence loss on offer delete (P0) | M2 after code deploy | staging delete/truncate tests | READY_FOR_PRODUCTION |
| Auth | Supabase Auth | — | middleware unchanged | — | Phase 9 audit | — | NOT_STARTED |
| Authorization | server-side guards | — | requireTeamManagement etc. | — | Phase 9 audit | — | NOT_STARTED |
| RLS | 6 tables RLS-without-policy with grants | — | — | Least privilege debt (P3) | Revoke in M3 for offer_health_state; others documented | ACL probes | IN_PROGRESS |
| Team OS | PR #38 live, 0 memberships | E2E validated | — | — | — | prior smoke | VERIFIED |
| Moderation | queue + locks; auto-claim on open; 3 historical bot approvals without audit (2026-09-08, evidence kept) | — | explicit claim (commit "opening the queue reads stats"); bot inserts structurally `pending`; bulk reject via audited RPC; automatic expiry audited | Auto-claim (P2) fixed; stale locks 9 (P3) cleared by first lifecycle run | Deploy | tests/moderation/explicitClaim, healthScanWrites | READY_FOR_PRODUCTION |
| Offers | 654 offers | — | — | Archive state absent (M1) | M1 | — | IN_PROGRESS |
| Search | RPC absent → fallback | RPC applied | M3 | — | M3 + verify fallback | ACL probe staging | READY_FOR_PRODUCTION |
| Hunter / Supply | Vercel crons | — | — | — | Phase 6 audit | — | NOT_STARTED |
| Health Scanner | 81/82 out_of_stock false positives; ~70 offers auto-expired | fixed classification validated | only 404/410 count; UPDATEs re-check live state (race-safe); expiry audited in moderation_logs | False expiry (P1 data, P2 check) | Deploy code after M1; recovery plan only | evaluateOfferHealth, healthScanWrites | READY_FOR_PRODUCTION |
| Coupons | tables absent; public endpoint returns empty, but queried a missing table on every offer view | tables exist (legacy shape) | **Decision: coupon migrations deferred for launch** (new capability, out of closure scope); schema-missing memo (10 min) stops failing queries; admin API no raw errors | Failing queries (P2) fixed in code | Deploy | couponSchemaGuard | READY_FOR_PRODUCTION |
| Distribution | tables absent; /admin/distribution raw 500 | foundation applied | foundation intentionally not applied; API returns `available:false` + "Distribution is not enabled in this environment." | Raw 500 (P2) fixed in code | Deploy | c3.opsSurface (not provisioned) | READY_FOR_PRODUCTION |
| Analytics / Events | offer_events only | product_events | M3 | — | M3 | — | READY_FOR_PRODUCTION |
| Notifications | — | — | daily/weekly digest crons | — | Phase 14 | — | NOT_STARTED |
| Achievements | live (#36) | — | — | — | Phase 12 smoke | — | NOT_STARTED |
| Profile | live | — | — | — | Phase 13 smoke | — | NOT_STARTED |
| Admin | live | — | — | raw errors on not-enabled modules (P2) | Phase 12 | — | NOT_STARTED |
| CEO Dashboard | integrity false positives; errored count queries silently PASS; price_logic compared a column to a string | new checks validated | PASS/WARN/FAIL/NOT_APPLICABLE with severity, reason, evidence, checkedAt, action; query errors are FAIL; stale-lock check added | image/freshness false alarms (P2), hidden UNKNOWN (P2) fixed | Deploy; first prod run will show lifecycle FAIL until step 3 | integrityClassification, integrityStatusModel | READY_FOR_PRODUCTION |
| Money | frozen (fail-closed) | — | — | Previously identified P0s | Read-only audit; stays frozen | — | IN_PROGRESS |
| Rewards | frozen | — | — | farming, cancelReward race (P0 if enabled) | Read-only audit | — | NOT_STARTED |
| Attribution | 11 clicks, 0 conversions | — | — | self/anonymous click (P0 if enabled) | Read-only audit | — | NOT_STARTED |
| Affiliate | ledger 10 rows | — | — | — | Read-only audit | — | NOT_STARTED |
| Security | 0 unsafe definers | — | — | — | Phase 9 | — | IN_PROGRESS |
| Observability | integrity cron daily | — | — | Silent job failures possible | Phase 14 | — | NOT_STARTED |
| Performance | — | — | — | — | Phase 15 measure | — | NOT_STARTED |
| Cron / background jobs | 16 Vercel crons, 1 pg_cron inactive | — | — | Lifecycle absent until enable | Phase 14 | — | IN_PROGRESS |
| Storage | — | 2 legacy buckets | — | — | Phase 9 policies | — | NOT_STARTED |
| Deployments | Vercel from master | — | — | — | PR + checks | — | IN_PROGRESS |
| Mobile UX | — | — | — | — | Phase 13 | — | NOT_STARTED |
| Desktop UX | — | — | — | — | Phase 12/13 | — | NOT_STARTED |
| Public SEO | — | — | sitemap.ts, robots | — | Phase 16 | — | NOT_STARTED |
| Error handling | raw 500s on not-enabled modules | — | — | (P2) | Phase 7/12 | — | NOT_STARTED |
| Account deletion | purge cron fails: profiles.deletion_* and account_deletion_audit absent | hold delta applied; `account_deletion_blockers` detects economic, Team OS and legacy FK evidence; anon/authenticated denied | anonymize → blockers → hold (sign-in ban + `deletion_hold_reason`, evidence retained) or auth delete; fails closed; idempotent; audited per phase | Broken purge (P1); team RESTRICT FKs would block deletion; cascade would drop fiscal data | M3 in prod, then prod purge dry run (0 requests) | accountPurge (6 cases) + staging SQL probes | READY_FOR_PRODUCTION |
| Data retention | policy v2 documented | — | OFFERS_LIFECYCLE_RETENTION_POLICY.md | — | — | — | READY_FOR_PRODUCTION |
| Backup / recovery | Supabase managed backups (plan-dependent) | — | — | Unverified PITR (P2) | Verify plan/backups | — | NOT_STARTED |
