-- Enable pg_cron job offers-lifecycle-v2 (created inactive by offers_lifecycle_v2.sql).
-- Apply only after a manual run of maintenance.run_offers_lifecycle() has been reviewed.
-- Disable: SELECT cron.alter_job(job_id := <jobid>, active := false);
-- Idempotent.

DO $$
DECLARE
  v_job bigint;
BEGIN
  SELECT jobid INTO v_job FROM cron.job WHERE jobname = 'offers-lifecycle-v2';
  IF v_job IS NULL THEN
    RAISE EXCEPTION 'offers-lifecycle-v2 job missing; apply offers_lifecycle_v2.sql first';
  END IF;
  IF to_regprocedure('maintenance.process_offers_lifecycle()') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy lifecycle function still present';
  END IF;
  PERFORM cron.alter_job(job_id := v_job, active := true);
END $$;
