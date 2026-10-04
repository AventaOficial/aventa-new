-- P0 emergency freeze: deactivate the unversioned pg_cron job
-- `daily-process-offers-lifecycle` (SELECT maintenance.process_offers_lifecycle()).
--
-- That function hard-deletes rejected offers (>30d) and approved offers expired >30d,
-- cascading into reward_outbound_clicks, offer_events, moderation_outcomes,
-- offer_votes, offer_reports, comments and nulling attribution links.
--
-- Effect: sets the job inactive. Does not drop the job or the function and does not
-- touch any row outside cron.job. While inactive, the 72h pending timeout also pauses
-- (pending offers stay pending) until offers_lifecycle_v2 replaces this job.
--
-- Idempotent. No-op where the job does not exist (staging has no such job).
-- Revert (only with explicit approval): cron.alter_job(job_id := <jobid>, active := true).

DO $$
DECLARE
  r record;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'daily-process-offers-lifecycle'
      AND active
  LOOP
    PERFORM cron.alter_job(job_id := r.jobid, active := false);
  END LOOP;
END $$;
