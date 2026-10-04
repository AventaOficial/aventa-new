# AVENTA FINAL LAUNCH VERDICT

Date: 2026-10-04. Production: Supabase `mkgsrpsuvedwwlzmzmzh`, Vercel `master` at `446e13c`.
Evidence: `docs/LAUNCH/AVENTA_LAUNCH_READINESS.md` (rollout log, audit results, domain matrix).

## VERDICT

**NO-GO today.** One open P1 (no backups) and one HIGH public-surface defect awaiting automatic
verification. When the conditions below are met the verdict becomes **GO WITH CONDITIONS — MONEY SAFETY
FROZEN**. Money/rewards/commissions stay disabled in every case; a full GO is not reachable while the
money path is frozen.

## P0

None open.

Closed today:
- Anonymous/authenticated writes to `offers` through `ofertas_ranked_general` (RLS bypass). Closed in
  production (`client_view_write_lockdown.sql`, PR #40); guarded by integrity check
  `security.client_writable_views`. Exploitation: no evidence found; not provable (no row-level update audit).
- Destructive lifecycle and evidence cascade (M1 + M2 in production).

## P1

1. **No backups / PITR**: Supabase organization is on the free plan. No recovery path for offer,
   moderation or attribution evidence. Requires an owner billing decision (Pro plan).
2. **12/12 live offers flagged `out_of_stock` by the pre-fix classifier**: offer pages render `noindex`
   and present the offers as unavailable; FTS excludes them (fallback search still returns them).
   Systemic fix is live (M3 due queue + 404/410-only rule); verify after the scanner runs of
   2026-10-05 and 2026-10-06 03:00 UTC.

## P2

- Staff/admin flows (explicit claim, moderation actions, distribution disabled page) not exercised with a
  real staff session in production (no credentials used; anonymous guards verified).
- Auth leaked-password protection disabled (dashboard setting).
- Offer page latency 1.5–3 s warm, ~10 s cold.
- No per-row update audit on `offers` (limits forensics).
- `MONEY_PATH_FROZEN` value in Vercel not read (default is frozen; 0 money writes in 34 days).
- Staging/production schema drift (process).

## P3

- Duplicated title suffix "| AVENTA | AVENTA"; home page without canonical.
- Advisor residue: `public_profiles_view` SECURITY DEFINER (read-only public columns),
  `is_moderator`/`user_has_moderation_role` executable by authenticated, 2 functions with mutable
  `search_path`.
- Flaky/pre-existing tests: `profileTheme.preMaster`, `writeAuthority.s91` (timeout under load),
  `fanoutMatching.s63` (compares latency).

## SECURITY

PASS. View write hole closed and guarded; write policies scoped to owner/staff; `profiles` column grants
correct; new tables and RPCs service_role only (role probes in production). Residual P2/P3 listed above.

## DATABASE

PASS. M1, M2, M3 and the view lockdown applied in order with checksums, prechecks, post-checks and
staging md5 parity. Legacy destructive job and function removed.

## DATA INTEGRITY

FAIL (P1 #2). 12 live offers carry stale `out_of_stock`. Historical, documented and preserved: 70 expired
approved offers (recovery plan, no automatic restore), 50 moderation logs without offer link, 3 bot
approvals without log. All other integrity checks clean.

## MONEY SAFETY

FROZEN. All 22 money rows are synthetic QA (2026-08-31), excluded from dashboards; 0 real conversions;
no money write since 2026-08-31; freeze fails closed in code. Prior P0s (reward farming, cancelReward
race, self/anonymous click attribution) remain unresolved and block activation.

## AUTHORIZATION

PASS for anonymous and role probes (admin routes 307/401, RPCs denied to anon/authenticated). Staff
session smoke pending (P2).

## MODERATION

PASS. Opening the queue no longer claims; claim is explicit; orphan locks cleared and logged (9);
automatic decisions audited (timeouts, lock clears, health expiry); bot inserts always `pending`.

## SUPPLY

PASS with HIGH carry-over: scanner classification fixed (only 404/410), writes race-safe and audited;
health data heals through the due queue (P1 #2).

## PUBLIC UX

FAIL (P1 #2 effect). Home, category, store, plaza, legal pages 200; unknown/archived offers 404; expired
offers noindex. Live offers currently shown as unavailable and `noindex`.

## ADMIN UX

PASS (anonymous guards, disabled states for distribution/coupons deployed). Real staff session not
exercised (P2).

## OBSERVABILITY

PASS. Integrity checks PASS/WARN/FAIL/NOT_APPLICABLE with severity and action; query errors are FAIL;
lifecycle runs logged; `/api/health` reports feed view health.

## PERFORMANCE

PASS with P2: offer page slow (1.5–3 s warm, ~10 s cold); other pages < 1 s.

## SEO

FAIL (P1 #2 effect): live offers `noindex`. Otherwise robots, sitemap (159 URLs), canonical slugs and OG
images correct; P3 title duplication.

## BACKGROUND JOBS

PASS. `offers-lifecycle-v2` is the only pg_cron job, enabled hourly; legacy job removed; 16 Vercel crons;
money crons blocked by the freeze.

## PRODUCTION VERIFICATION

PASS. Every production step verified with read-only queries and rolled-back probes; evidence counts
unchanged (offers 654, offer_events 404, clicks 11, ledger 10, rewards 6; moderation_logs 446 → 455,
+9 audited lock clears).

## PENDING AUTOMATIC VERIFICATION

- First automatic `offers-lifecycle-v2` run (19:17 UTC 2026-10-04): PENDING VERIFICATION. Job active,
  `17 * * * *`, `postgres`, command `SELECT maintenance.run_offers_lifecycle(1000);`; function has
  advisory lock + SKIP LOCKED, no DELETE, policy v2. Expected: one `cron.job_run_details` row
  `succeeded` and one `offer_lifecycle_runs` row with timed_out 0, locks_cleared 0, archived_rejected 0,
  archived_expired 0, backlog_remaining false (backlog drained by the manual run).
- Health scanner runs 2026-10-05 and 2026-10-06 03:00 UTC (P1 #2).
- Account-deletion purge first run with M3 (06:30 UTC): expected 0 requests, no errors.

## REMAINING RISKS

- Data loss without backups (P1 #1).
- Health heal depends on scanner runs succeeding against retailer pages; if pages are unreachable the
  offers become `unknown`/`error`, not `available` — verify the resulting indexability.
- Possible undetected writes during the exposure window of the view hole (no row audit).
- Money path: activation would reintroduce known P0s.

## LAUNCH BLOCKERS

1. Supabase backups (upgrade organization to Pro, confirm daily backups / PITR).
2. Live offers no longer `out_of_stock` after the scanner runs (integrity: 0 live offers with stale
   `out_of_stock`; offer pages indexable).

## CONDITIONS FOR GO

GO WITH CONDITIONS — MONEY SAFETY FROZEN — when all are true:
1. Backups enabled and verified (blocker 1).
2. Blocker 2 verified after 2026-10-06 03:00 UTC.
3. `offer_lifecycle_runs` shows hourly automatic runs with no backlog.
4. Owner smoke with a staff account: open moderation (no claim), claim explicitly, approve/reject one
   offer, `/admin/distribution` shows "Distribution is not enabled in this environment."
5. Money/rewards/commissions remain disabled; `MONEY_PATH_FROZEN` not set to false.
