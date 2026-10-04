-- Offers lifecycle v2 (retention policy v2). Replaces the unversioned
-- maintenance.process_offers_lifecycle() / pg_cron job `daily-process-offers-lifecycle`.
--
-- Policy v2 (docs/SYSTEMS/OFFERS_LIFECYCLE_RETENTION_POLICY.md):
--   * Offers are never physically deleted by the lifecycle.
--   * pending  > 72h                       -> rejected (auto_rejected_timeout), lock cleared,
--                                             one moderation_logs row per offer.
--   * rejected > 30d (created_at)          -> archived (archive_reason = rejected_retention)
--   * approved/published expired > 30d     -> archived (archive_reason = expired_retention)
--   * non-pending offers holding a lock    -> lock cleared, one moderation_logs row.
--   Archived offers keep every dependent row (events, clicks, rewards, attribution, audit).
--   Any later change to status or expires_at un-archives the offer (trg_offers_archive_guard);
--   the lifecycle re-archives it deterministically if it still qualifies.
--
-- Safety: each run is one transaction, bounded per step, FOR UPDATE SKIP LOCKED, serialized
-- with an advisory lock, idempotent (state guards on every UPDATE).
-- The new cron job is created INACTIVE; enable with offers_lifecycle_v2_enable.sql.
-- Disable: SELECT cron.alter_job(job_id := <jobid>, active := false);
-- Idempotent.

SET lock_timeout = '5s';

-- ---------------------------------------------------------------------------
-- Archive state on offers
-- ---------------------------------------------------------------------------

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.offers'::regclass AND conname = 'offers_archive_state_check'
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_archive_state_check CHECK (
        (archived_at IS NULL AND archive_reason IS NULL)
        OR (archived_at IS NOT NULL AND archive_reason = 'rejected_retention' AND status = 'rejected')
        OR (archived_at IS NOT NULL AND archive_reason = 'expired_retention' AND status IN ('approved', 'published'))
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE public.offers VALIDATE CONSTRAINT offers_archive_state_check;

COMMENT ON COLUMN public.offers.archived_at IS
  'Retention policy v2: set by maintenance.run_offers_lifecycle. Archived offers are never publicly visible and keep all dependent evidence.';
COMMENT ON COLUMN public.offers.archive_reason IS
  'rejected_retention | expired_retention. NULL when not archived.';

CREATE INDEX IF NOT EXISTS idx_offers_status_created_pending
  ON public.offers (created_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_offers_lifecycle_rejected_unarchived
  ON public.offers (created_at) WHERE status = 'rejected' AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_offers_lifecycle_expired_unarchived
  ON public.offers (expires_at)
  WHERE status IN ('approved', 'published') AND archived_at IS NULL AND expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offers_locked_non_pending
  ON public.offers (id) WHERE locked_by IS NOT NULL AND status <> 'pending';

-- ---------------------------------------------------------------------------
-- updated_at: lifecycle housekeeping must not move updated_at (anti-recirculation
-- cooldown in lib/offers/findDuplicateOffer.ts is anchored on it).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.offers_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('aventa.preserve_updated_at', true) = 'on' THEN
    NEW.updated_at := OLD.updated_at;
  ELSE
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_updated_at ON public.offers;
CREATE TRIGGER trigger_set_updated_at
  BEFORE UPDATE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offers_touch_updated_at();

CREATE OR REPLACE FUNCTION public.offers_archive_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.archived_at IS NOT NULL
     AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at
     AND (NEW.status IS DISTINCT FROM OLD.status OR NEW.expires_at IS DISTINCT FROM OLD.expires_at) THEN
    NEW.archived_at := NULL;
    NEW.archive_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_offers_archive_guard ON public.offers;
CREATE TRIGGER trg_offers_archive_guard
  BEFORE UPDATE OF status, expires_at ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.offers_archive_guard();

REVOKE ALL ON FUNCTION public.offers_touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.offers_archive_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run log (observability). One row per successful run; failed runs roll back and are
-- visible in cron.job_run_details.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.offer_lifecycle_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version integer NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  batch_limit integer NOT NULL,
  timed_out integer NOT NULL DEFAULT 0,
  locks_cleared integer NOT NULL DEFAULT 0,
  archived_rejected integer NOT NULL DEFAULT 0,
  archived_expired integer NOT NULL DEFAULT 0,
  backlog_remaining boolean NOT NULL DEFAULT false,
  actor text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_offer_lifecycle_runs_started
  ON public.offer_lifecycle_runs (started_at DESC);

ALTER TABLE public.offer_lifecycle_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.offer_lifecycle_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.offer_lifecycle_runs FROM service_role;
GRANT SELECT ON public.offer_lifecycle_runs TO service_role;

COMMENT ON TABLE public.offer_lifecycle_runs IS
  'Offers lifecycle v2 run log. Written only by maintenance.run_offers_lifecycle.';

-- ---------------------------------------------------------------------------
-- Lifecycle
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS maintenance;
REVOKE ALL ON SCHEMA maintenance FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION maintenance.run_offers_lifecycle(p_batch_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_policy constant integer := 2;
  v_limit integer := least(greatest(coalesce(p_batch_limit, 1000), 1), 10000);
  v_run uuid := gen_random_uuid();
  v_started timestamptz := clock_timestamp();
  v_timed_out integer := 0;
  v_locks integer := 0;
  v_arch_rejected integer := 0;
  v_arch_expired integer := 0;
  v_result jsonb;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('aventa.offers_lifecycle')::bigint) THEN
    RETURN jsonb_build_object('skipped', 'run_in_progress');
  END IF;

  -- 1) pending > 72h -> rejected. Moves updated_at (cooldown anchor = rejection time).
  WITH cand AS (
    SELECT o.id, o.locked_by, o.locked_at
    FROM public.offers o
    WHERE o.status = 'pending'
      AND o.created_at <= now() - interval '72 hours'
      AND (o.locked_by IS NULL OR o.locked_at IS NULL OR o.locked_at < now() - interval '15 minutes')
    ORDER BY o.created_at
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  ), upd AS (
    UPDATE public.offers o
    SET status = 'rejected',
        rejection_reason = COALESCE(NULLIF(o.rejection_reason, ''), 'auto_rejected_timeout'),
        locked_by = NULL,
        locked_at = NULL,
        snoozed_until = NULL
    FROM cand
    WHERE o.id = cand.id AND o.status = 'pending'
    RETURNING o.id, o.rejection_reason, cand.locked_by AS prev_locked_by, cand.locked_at AS prev_locked_at
  ), logged AS (
    INSERT INTO public.moderation_logs (offer_id, user_id, action, previous_status, new_status, reason, metadata, created_at)
    SELECT u.id, NULL, 'auto_rejected_timeout', 'pending', 'rejected', u.rejection_reason,
           jsonb_build_object(
             'actor', 'system:offers_lifecycle',
             'policy_version', v_policy,
             'run_id', v_run,
             'threshold_hours', 72,
             'previous_locked_by', u.prev_locked_by,
             'previous_locked_at', u.prev_locked_at
           ),
           now()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_timed_out FROM logged;

  -- Housekeeping below must not move updated_at.
  PERFORM set_config('aventa.preserve_updated_at', 'on', true);

  -- 2) Locks held by non-pending offers.
  WITH cand AS (
    SELECT o.id, o.status, o.locked_by, o.locked_at
    FROM public.offers o
    WHERE o.locked_by IS NOT NULL AND o.status <> 'pending'
    ORDER BY o.id
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  ), upd AS (
    UPDATE public.offers o
    SET locked_by = NULL, locked_at = NULL
    FROM cand
    WHERE o.id = cand.id AND o.status <> 'pending' AND o.locked_by IS NOT NULL
    RETURNING o.id, o.status, cand.locked_by AS prev_locked_by, cand.locked_at AS prev_locked_at
  ), logged AS (
    INSERT INTO public.moderation_logs (offer_id, user_id, action, previous_status, new_status, reason, metadata, created_at)
    SELECT u.id, NULL, 'lock_cleared_non_pending', u.status, u.status, 'lifecycle_orphan_lock',
           jsonb_build_object(
             'actor', 'system:offers_lifecycle',
             'policy_version', v_policy,
             'run_id', v_run,
             'previous_locked_by', u.prev_locked_by,
             'previous_locked_at', u.prev_locked_at
           ),
           now()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_locks FROM logged;

  -- 3) rejected > 30d -> archived.
  WITH cand AS (
    SELECT o.id
    FROM public.offers o
    WHERE o.status = 'rejected'
      AND o.archived_at IS NULL
      AND o.created_at <= now() - interval '30 days'
    ORDER BY o.created_at
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  ), upd AS (
    UPDATE public.offers o
    SET archived_at = now(), archive_reason = 'rejected_retention'
    FROM cand
    WHERE o.id = cand.id AND o.status = 'rejected' AND o.archived_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_arch_rejected FROM upd;

  -- 4) approved/published expired > 30d -> archived.
  WITH cand AS (
    SELECT o.id
    FROM public.offers o
    WHERE o.status IN ('approved', 'published')
      AND o.archived_at IS NULL
      AND o.expires_at IS NOT NULL
      AND o.expires_at <= now() - interval '30 days'
    ORDER BY o.expires_at
    LIMIT v_limit
    FOR UPDATE OF o SKIP LOCKED
  ), upd AS (
    UPDATE public.offers o
    SET archived_at = now(), archive_reason = 'expired_retention'
    FROM cand
    WHERE o.id = cand.id
      AND o.status IN ('approved', 'published')
      AND o.archived_at IS NULL
      AND o.expires_at <= now() - interval '30 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_arch_expired FROM upd;

  PERFORM set_config('aventa.preserve_updated_at', 'off', true);

  INSERT INTO public.offer_lifecycle_runs (
    id, policy_version, started_at, finished_at, batch_limit,
    timed_out, locks_cleared, archived_rejected, archived_expired, backlog_remaining, actor
  ) VALUES (
    v_run, v_policy, v_started, clock_timestamp(), v_limit,
    v_timed_out, v_locks, v_arch_rejected, v_arch_expired,
    (v_timed_out = v_limit OR v_locks = v_limit OR v_arch_rejected = v_limit OR v_arch_expired = v_limit),
    current_user
  );

  v_result := jsonb_build_object(
    'run_id', v_run,
    'policy_version', v_policy,
    'timed_out', v_timed_out,
    'locks_cleared', v_locks,
    'archived_rejected', v_arch_rejected,
    'archived_expired', v_arch_expired
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION maintenance.run_offers_lifecycle(integer) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION maintenance.run_offers_lifecycle(integer) IS
  'Offers lifecycle v2 (policy v2). Never deletes rows. Scheduled by pg_cron job offers-lifecycle-v2 (hourly :17).';

-- ---------------------------------------------------------------------------
-- Atomic bulk reject for staff tools (replaces physical deletion of the bot queue).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reject_pending_offers_bulk(
  p_offer_ids uuid[],
  p_actor_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor required';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reason required';
  END IF;
  IF coalesce(cardinality(p_offer_ids), 0) = 0 THEN
    RETURN 0;
  END IF;
  IF cardinality(p_offer_ids) > 5000 THEN
    RAISE EXCEPTION 'too many offers (max 5000)';
  END IF;

  WITH upd AS (
    UPDATE public.offers o
    SET status = 'rejected',
        rejection_reason = left(btrim(p_reason), 200),
        locked_by = NULL,
        locked_at = NULL,
        snoozed_until = NULL
    WHERE o.id = ANY (p_offer_ids) AND o.status = 'pending'
    RETURNING o.id
  ), logged AS (
    INSERT INTO public.moderation_logs (offer_id, user_id, action, previous_status, new_status, reason, metadata, created_at)
    SELECT u.id, p_actor_id, 'bulk_rejected', 'pending', 'rejected', left(btrim(p_reason), 200),
           jsonb_build_object('actor', 'staff:bulk_reject', 'requested', cardinality(p_offer_ids)),
           now()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM logged;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_pending_offers_bulk(uuid[], uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_pending_offers_bulk(uuid[], uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Cron: retire the legacy job and function, schedule v2 (inactive).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r record;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE EXCEPTION 'pg_cron is required';
  END IF;

  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'daily-process-offers-lifecycle' LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'offers-lifecycle-v2') THEN
    PERFORM cron.schedule(
      'offers-lifecycle-v2',
      '17 * * * *',
      'SELECT maintenance.run_offers_lifecycle(1000);'
    );
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'offers-lifecycle-v2'),
      active := false
    );
  END IF;
END $$;

DROP FUNCTION IF EXISTS maintenance.process_offers_lifecycle();
