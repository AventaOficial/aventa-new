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

## Production rollout log (Phase 2, 2026-10-04)

| # | Step | Evidence | Result |
|---|---|---|---|
| 1 | M1 `offers_lifecycle_v2` (sha256 `CD7794BD…`) | `archived_at`/`archive_reason` present, `offers_archive_state_check` valid; `offer_lifecycle_runs` ACL `service_role=r` only; legacy job and `process_offers_lifecycle` gone; job `offers-lifecycle-v2` created inactive. Function md5 equal to staging for `reject_pending_offers_bulk`, `offers_archive_guard`, `offers_touch_updated_at`; `run_offers_lifecycle` differs only by 5 comment lines (body identical). Counts unchanged (offers 654, modlogs 446, events 404, clicks 11, ledger 10, rewards 6) | VERIFIED |
| 2 | Code deploy: PR #39 squash `014cca5` | CI `verify` + Vercel prod/staging pass; prod smoke: `/` 200, `/api/health` 200, sitemap 200, robots 200, `/admin/moderation` 307, `GET /api/admin/moderation/claim-next` 401 (new route live and guarded) | VERIFIED |
| 3 | Manual run `run_offers_lifecycle(1000)` | dry count = expectation; run `4e50a954…`: timed_out 0, locks_cleared 9, archived_rejected 5, archived_expired 0; modlogs +9 (`lock_cleared_non_pending`, same run_id); `updated_at` of touched rows unchanged; status counts unchanged; evidence counts unchanged | VERIFIED |
| 4 | Enable (`F40ADF89…`) | `offers-lifecycle-v2` active, `17 * * * *`, command `SELECT maintenance.run_offers_lifecycle(1000);`; it is the only pg_cron job; legacy job absent | VERIFIED (first automatic run: see Phase 2 addendum) |
| 5 | M2 `offers_evidence_protection` (`2486E633…`) | precheck: 14 FKs validated (no orphans), 0 DB functions deleting evidence, app code deletes evidence only in staging scripts; post: 14 FKs `RESTRICT` validated, 26 append-only triggers; rolled-back probe: DELETE on offer_events / moderation_logs / creator_rewards blocked (42501), DELETE of an offer with clicks blocked (23503); counts unchanged | VERIFIED |
| 6 | M3 `launch_hardening_v2` (`A5EF6855…`) | precheck: health statuses within new CHECK, all columns present, every `offer_health_state` consumer uses the service client; post: 4 function md5 equal to staging, ACLs service_role only, `search_document` backfilled (0 null), 0 offers with moved `updated_at`, 0 deletion requests; rolled-back probes: anon/authenticated DENIED on health/product_events/deletion audit/search RPC/blockers/lifecycle runs | VERIFIED |
| 7 | **New P0** `client_view_write_lockdown` (PR #40 `446e13c`) | see Security | VERIFIED |

## Production audit results (Phases 3, 9, 10 — read-only)

### Data integrity (Phase 3)

| Check | Result | Severity | Disposition |
|---|---|---|---|
| Live offers flagged `out_of_stock` by the pre-fix classifier | 12/12 live offers; offer page renders `noindex` for them | HIGH | Systemic: M3 queue schedules all of them within 48 h; scanner (03:00 UTC daily) applies 404/410-only rule. Verify after 2026-10-06 03:00 UTC. No manual data edit |
| Approved offers expired, not archived | 70 (69 in recovery plan + 1 natural expiry) | MEDIUM | `EXPIRED_OFFERS_RECOVERY_PLAN.md`; not restored automatically |
| `moderation_logs.offer_id` null | 50 | LOW | Historical loss through the old `SET NULL`; irrecoverable; now prevented by M2 |
| Approved without approval log | 3 (bot, 2026-09-08) | MEDIUM | Historical, kept; new bot inserts are structurally `pending` |
| Price, URL, image, category, creator, vote counters, duplicate votes, click idempotency, orphan locks | 0 violations | CLEAN | — |

### Security (Phase 9)

- **P0 found and closed:** `ofertas_ranked_general` (single-table view over `offers`, owner `postgres`,
  no `security_invoker`) granted INSERT/UPDATE/DELETE to anon/authenticated through Supabase default
  privileges re-applied on every view recreation. Rolled-back probe: anon `UPDATE offers` = 0 rows,
  through the view = 1 row. Fix: `client_view_write_lockdown.sql` (all public views/matviews, SELECT
  untouched) validated in staging, applied in production; probes: writes DENIED, feed/profile reads
  intact (82/18), `/api/health` `feedViewOk: true`. Regression guard: integrity check
  `security.client_writable_views` (critical FAIL). Exploitation: no evidence (all `offer_url`
  domains legitimate, all creators valid) but no per-row update audit exists — **UNKNOWN**.
- Write policies: all scoped to `auth.uid()` or staff role. RLS disabled on client-reachable tables: 0.
- `profiles`: no table-level UPDATE; column grants limited to display fields and
  `account_deletion_requested_at`; reputation, badges, tracking tags, fiscal and `deletion_*` not writable.
- Advisor residue: `public_profiles_view` SECURITY DEFINER (read-only, 7 public columns, intended
  public surface) LOW; `is_moderator`/`user_has_moderation_role` executable by authenticated (self
  boolean) LOW; 2 functions with mutable `search_path` LOW; Auth leaked-password protection disabled P2
  (dashboard setting, Auth out of scope).

### Money (Phase 10)

- All 22 money rows are synthetic QA written on 2026-08-31 by a test pointed at production
  (`AUDIT_staging_environment_forensics.md`): ledger `external_ref` `staging-qa-*`/`qa-*`, payouts
  "staging QA simulado". Real conversions 0. Dashboards classify through the ledger
  (`financialRecordClass` → `SYNTHETIC_QA`) and exclude them. Rows kept as evidence.
- Inconsistency inside the QA set: rewards `f8278d7a`, `09cf8135` attributed `sub_id` while their ledger
  rows are `attributable=false` with no creator — consistent with QA misuse, irrelevant while frozen.
- Freeze: code is fail-closed in production; every money engine and mutating route checks it. No money
  write since 2026-08-31 (34 days of daily money crons). `MONEY_PATH_FROZEN` value in Vercel: **UNKNOWN**
  (CLI unavailable here); default is frozen.
- Verdict: **FROZEN**. Not auditable as PASS for activation (prior P0s: farming, cancelReward race,
  self/anonymous click attribution).

### Platform

- Supabase organization plan: **free** (no automated backups / PITR). Backup & recovery: **FAIL** (P1).

### Tests (Phase 17)

`npx vitest run` on `446e13c`: 4150 passed, 3 failed, 8 skipped. Failures are pre-existing/flaky and
unrelated: `profileTheme.preMaster` (fails on baseline `bc0abde`), `writeAuthority.s91` (timeout under
full-suite load; passes alone), `fanoutMatching.s63` "deterministic replay" (compares `stats` that
include `latencyMs`). `tsc` clean, `npm run build` passed on the release branch, CI `verify` green on #39/#40.

## Domain matrix

| Domain | Production | Staging | Repo / schema | Known issues (severity) | Required action | Tests | Status |
|---|---|---|---|---|---|---|---|
| Database | M1, M2, M3, view lockdown applied with prechecks/post-checks | same + lockdown | ordered plan executed | Staging/prod drift remains (P2 process) | — | parity md5 per migration | VERIFIED |
| Lifecycle | v2 enabled hourly; manual run clean | v2 hourly | M1 + enable | — | Confirm automatic runs | staging suite + prod run `4e50a954` | VERIFIED |
| Evidence | RESTRICT + append-only (26 triggers) | same | M2 | — | — | prod rolled-back delete probes | VERIFIED |
| Auth | Supabase Auth; leaked-password protection off | — | middleware unchanged | P2 (dashboard setting) | Owner enables in Auth settings | — | IN_PROGRESS |
| Authorization | server guards; `GET claim-next` 401 anonymous | — | requireModerationActor etc. | Admin flows not exercised with a real session here | Owner smoke with staff account | route tests | IN_PROGRESS |
| RLS | write policies scoped; profiles column grants; views read-only | — | — | View write hole (P0) closed | — | prod role probes | VERIFIED |
| Team OS | PR #38 live, 0 memberships | E2E validated | — | — | — | prior smoke | VERIFIED |
| Moderation | queue + locks; auto-claim on open; 3 historical bot approvals without audit (2026-09-08, evidence kept) | — | explicit claim (commit "opening the queue reads stats"); bot inserts structurally `pending`; bulk reject via audited RPC; automatic expiry audited | Auto-claim (P2) fixed; stale locks 9 (P3) cleared by first lifecycle run | Deploy | tests/moderation/explicitClaim, healthScanWrites | READY_FOR_PRODUCTION |
| Offers | 654 offers; 12 live; 5 archived (rejected retention) | — | — | 12/12 live offers stale `out_of_stock` → `noindex` (HIGH, self-healing ≤48 h) | Verify after 2026-10-06 03:00 UTC | integrity audit | IN_PROGRESS |
| Search | RPC applied (service_role only); returns 0 today because every live offer is `out_of_stock`; app falls back to ilike (no regression) | RPC applied | M3 | Inconsistency FTS vs fallback until health heals | none | ACL probes prod | VERIFIED |
| Hunter / Supply | Vercel crons | — | — | — | Phase 6 audit | — | NOT_STARTED |
| Health Scanner | 81/82 out_of_stock false positives; ~70 offers auto-expired | fixed classification validated | only 404/410 count; UPDATEs re-check live state (race-safe); expiry audited in moderation_logs | False expiry (P1 data, P2 check) | Deploy code after M1; recovery plan only | evaluateOfferHealth, healthScanWrites | READY_FOR_PRODUCTION |
| Coupons | tables absent; public endpoint returns empty, but queried a missing table on every offer view | tables exist (legacy shape) | **Decision: coupon migrations deferred for launch** (new capability, out of closure scope); schema-missing memo (10 min) stops failing queries; admin API no raw errors | Failing queries (P2) fixed in code | Deploy | couponSchemaGuard | READY_FOR_PRODUCTION |
| Distribution | tables absent; /admin/distribution raw 500 | foundation applied | foundation intentionally not applied; API returns `available:false` + "Distribution is not enabled in this environment." | Raw 500 (P2) fixed in code | Deploy | c3.opsSurface (not provisioned) | READY_FOR_PRODUCTION |
| Analytics / Events | offer_events + product_events (service_role only) | product_events | M3 | — | — | ACL probes prod | VERIFIED |
| Notifications | — | — | daily/weekly digest crons | — | Phase 14 | — | NOT_STARTED |
| Achievements | live (#36) | — | — | — | Phase 12 smoke | — | NOT_STARTED |
| Profile | live | — | — | — | Phase 13 smoke | — | NOT_STARTED |
| Admin | live | — | — | raw errors on not-enabled modules (P2) | Phase 12 | — | NOT_STARTED |
| CEO Dashboard | integrity false positives; errored count queries silently PASS; price_logic compared a column to a string | new checks validated | PASS/WARN/FAIL/NOT_APPLICABLE with severity, reason, evidence, checkedAt, action; query errors are FAIL; stale-lock check added | image/freshness false alarms (P2), hidden UNKNOWN (P2) fixed | Deploy; first prod run will show lifecycle FAIL until step 3 | integrityClassification, integrityStatusModel | READY_FOR_PRODUCTION |
| Money | FROZEN; 22 rows all synthetic QA; 0 writes since 2026-08-31 | — | — | Prior P0s if enabled; env value UNKNOWN | Stays frozen | Phase 10 audit | FROZEN |
| Rewards | frozen | — | — | farming, cancelReward race (P0 if enabled) | Read-only audit | — | NOT_STARTED |
| Attribution | 11 clicks, 0 conversions | — | — | self/anonymous click (P0 if enabled) | Read-only audit | — | NOT_STARTED |
| Affiliate | ledger 10 rows | — | — | — | Read-only audit | — | NOT_STARTED |
| Security | P0 view write hole closed; advisor residue LOW/P2 | — | `client_view_write_lockdown.sql` + integrity guard | Exploitation UNKNOWN (no row audit) | — | clientViewWriteLockdown + prod probes | VERIFIED |
| Observability | integrity cron 02:30 UTC with PASS/WARN/FAIL/NA + severity; `/api/health` reports `feedViewOk`; lifecycle runs logged | — | — | No per-row update audit on offers (P2) | — | integrityStatusModel | VERIFIED |
| Performance | home 0.3–0.7 s, category/store 0.5–0.9 s; offer page 1.5–3 s warm, 10 s cold | — | — | Slow offer page (P2) | Post-launch profiling | prod HTTP timing | IN_PROGRESS |
| Cron / background jobs | 16 Vercel crons; pg_cron `offers-lifecycle-v2` active (only job) | — | — | — | Confirm hourly runs in `offer_lifecycle_runs` | prod catalog | VERIFIED |
| Storage | — | 2 legacy buckets | — | — | Phase 9 policies | — | NOT_STARTED |
| Deployments | Vercel from master | — | — | — | PR + checks | — | IN_PROGRESS |
| Mobile UX | — | — | — | — | Phase 13 | — | NOT_STARTED |
| Desktop UX | — | — | — | — | Phase 12/13 | — | NOT_STARTED |
| Public SEO | robots disallows private areas; sitemap 159 URLs; offer pages canonical slug + OG; expired → noindex; archived/unknown → 404 | — | sitemap.ts, robots | Live offers `noindex` (health, HIGH, self-healing); duplicated title suffix "\| AVENTA \| AVENTA" (P3); home without canonical (P3) | Verify after health heals | prod HTTP smoke | IN_PROGRESS |
| Error handling | raw 500s on not-enabled modules | — | — | (P2) | Phase 7/12 | — | NOT_STARTED |
| Account deletion | M3 applied: columns, audit table, `account_deletion_blockers` (service_role only); 0 pending requests; first cron run 06:30 UTC | hold delta applied; `account_deletion_blockers` detects economic, Team OS and legacy FK evidence; anon/authenticated denied | anonymize → blockers → hold (sign-in ban + `deletion_hold_reason`, evidence retained) or auth delete; fails closed; idempotent; audited per phase | Broken purge (P1); team RESTRICT FKs would block deletion; cascade would drop fiscal data | M3 in prod, then prod purge dry run (0 requests) | accountPurge (6 cases) + staging SQL probes | READY_FOR_PRODUCTION |
| Data retention | policy v2 documented | — | OFFERS_LIFECYCLE_RETENTION_POLICY.md | — | — | — | READY_FOR_PRODUCTION |
| Backup / recovery | Supabase organization on **free** plan: no automated backups, no PITR | — | — | No recovery path for evidence (P1) | Owner upgrades to Pro (billing decision) | get_organization | NO_GO |
