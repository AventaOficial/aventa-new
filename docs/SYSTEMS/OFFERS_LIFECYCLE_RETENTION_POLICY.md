# Offers lifecycle — retention policy v2

Replaces the unversioned `maintenance.process_offers_lifecycle()` (pg_cron `daily-process-offers-lifecycle`),
which hard-deleted offers and cascaded into clicks, events, moderation history and attribution.

## Principles

1. The lifecycle never deletes rows. Offers move between states; evidence stays attached.
2. Every automatic decision on an offer writes one `moderation_logs` row (`user_id = NULL`,
   `metadata.actor = 'system:offers_lifecycle'`, `metadata.policy_version = 2`, `metadata.run_id`).
3. Housekeeping (lock cleanup, archival) does not move `offers.updated_at`; the anti-recirculation
   cooldown in `lib/offers/findDuplicateOffer.ts` is anchored on it.
4. Evidence tables are append-only at the database level (`offers_evidence_protection.sql`).

## States

| State | Definition | Public |
|---|---|---|
| PENDING | `status = 'pending'` | no |
| ACTIVE | `status IN ('approved','published') AND deleted_at IS NULL AND (expires_at IS NULL OR expires_at > now())` | yes |
| EXPIRED | approved/published with `expires_at <= now()` | no |
| REJECTED | `status = 'rejected'` | no |
| ARCHIVED | `archived_at IS NOT NULL` (`archive_reason` = `rejected_retention` \| `expired_retention`) | no |
| REMOVED | `deleted_at IS NOT NULL` (takedown / soft delete, unchanged) | no |

`offers_archive_state_check` allows only consistent combinations: `rejected_retention` requires
`status = 'rejected'`, `expired_retention` requires `status IN ('approved','published')`.

## Transitions (maintenance.run_offers_lifecycle, hourly at :17)

| From | Condition | To | Audit action |
|---|---|---|---|
| PENDING | `created_at <= now() - 72h` and lock free or stale (> 15 min) | REJECTED (`rejection_reason` kept or `auto_rejected_timeout`), lock and snooze cleared | `auto_rejected_timeout` |
| any non-pending | `locked_by IS NOT NULL` | same status, lock cleared | `lock_cleared_non_pending` |
| REJECTED | `created_at <= now() - 30d` | ARCHIVED (`rejected_retention`) | — (run log) |
| EXPIRED | `expires_at <= now() - 30d` | ARCHIVED (`expired_retention`) | — (run log) |

Other transitions:

- Staff bulk purge of the bot queue: `reject_pending_offers_bulk` (PENDING → REJECTED,
  `bulk_rejected`, actor = staff user). Replaces physical deletion.
- Health scanner: auto-expires (`expires_at = now()`) only after two consecutive confirmed
  HTTP 404/410 observations. Parse failures and other HTTP errors are `unknown`.
- Any change to `status` or `expires_at` on an archived offer clears the archive
  (`trg_offers_archive_guard`); the lifecycle re-archives it if it still qualifies.

## Retention

| Data | Retention |
|---|---|
| Offers (all states) | Indefinite. Archival only. |
| `offer_events`, `reward_outbound_clicks`, affiliate/reward/payout tables, `moderation_logs`, `moderation_outcomes` | Indefinite, append-only. DELETE/TRUNCATE blocked by trigger for every role. |
| `offer_votes`, `comments` | User-controlled (unvote / delete comment allowed). Cannot be removed by deleting the offer (FK RESTRICT). |
| `offer_health_state`, `offer_favorites`, `community_offers`, `offer_quality_checks` | Operational; cascade with the offer. |
| `offer_lifecycle_runs` | Indefinite (one row per successful run). |

Deleting an offer is only possible when it has no evidence rows (FK RESTRICT). Removing evidence
requires a reviewed break-glass migration that disables the trigger for one operation.

## Operations

- Run manually: `SELECT maintenance.run_offers_lifecycle(1000);` (postgres only).
- Disable: `SELECT cron.alter_job(job_id := (SELECT jobid FROM cron.job WHERE jobname = 'offers-lifecycle-v2'), active := false);`
- Monitor: `offer_lifecycle_runs` (latest `started_at` < 3h, `backlog_remaining`), integrity checks
  `lifecycle.last_run`, `lifecycle.archive_invariant`, `moderation.orphan_locks`.
- Concurrency: one run at a time (advisory lock; a concurrent call returns `{"skipped":"run_in_progress"}`);
  rows held by moderators are skipped (`FOR UPDATE SKIP LOCKED`) and every update re-checks state.

## Migration order (production)

1. `offers_lifecycle_v2.sql` — additive, compatible with the currently deployed code. Job created
   inactive; legacy job/function removed.
2. Deploy application code (bot-queue reject via `reject_pending_offers_bulk`, health
   classification, integrity checks).
3. Manual run `SELECT maintenance.run_offers_lifecycle(1000);` and review, then
   `offers_lifecycle_v2_enable.sql`.
4. `offers_evidence_protection.sql` — only after step 2 (the old endpoint deleted offers).
5. `launch_hardening_v2.sql` — only after step 2 (enables the full freshness queue).
