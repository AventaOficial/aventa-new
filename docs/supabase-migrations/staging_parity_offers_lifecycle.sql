-- STAGING ONLY. Never apply to production (production already has these objects).
--
-- Brings staging (oojshofrpbfwsiypcecr) to parity with production for the objects the
-- offers lifecycle redesign touches, so offers_lifecycle_v2 / offers_evidence_protection /
-- launch_hardening_v2 are validated against the same starting point:
--   1. public.offer_health_state (repo file offer_health_state.sql, applied in production
--      outside schema_migrations).
--   2. trigger_set_updated_at on public.offers (present in production, unversioned).
--   3. The legacy maintenance.process_offers_lifecycle() and its pg_cron job, INACTIVE,
--      exactly as frozen in production by offers_lifecycle_freeze.
-- Idempotent.

DO $$
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'unexpected database';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.offer_health_state (
  offer_id uuid PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('available', 'price_changed', 'out_of_stock')),
  last_checked_at timestamptz NOT NULL,
  published_price numeric,
  live_price numeric,
  price_delta_pct numeric,
  diagnostic text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_health_state_status
  ON public.offer_health_state (status);

CREATE INDEX IF NOT EXISTS idx_offer_health_state_last_checked
  ON public.offer_health_state (last_checked_at DESC);

ALTER TABLE public.offer_health_state ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.offers'::regclass AND tgname = 'trigger_set_updated_at'
  ) THEN
    CREATE TRIGGER trigger_set_updated_at
      BEFORE UPDATE ON public.offers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS maintenance;

DO $$
BEGIN
  IF to_regprocedure('maintenance.process_offers_lifecycle()') IS NULL
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'offers-lifecycle-v2') THEN
    EXECUTE $fn$
      CREATE FUNCTION maintenance.process_offers_lifecycle()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      BEGIN
        UPDATE public.offers
        SET status = 'rejected',
            rejection_reason = COALESCE(rejection_reason, 'auto_rejected_timeout')
        WHERE status = 'pending'
          AND created_at <= now() - interval '3 days';

        DELETE FROM public.offers
        WHERE status = 'rejected'
          AND created_at <= now() - interval '30 days';

        DELETE FROM public.offers
        WHERE status = 'approved'
          AND expires_at IS NOT NULL
          AND expires_at <= now() - interval '30 days';

        RETURN;
      END;
      $body$
    $fn$;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-process-offers-lifecycle')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'offers-lifecycle-v2') THEN
    PERFORM cron.schedule(
      'daily-process-offers-lifecycle',
      '0 3 * * *',
      'SELECT maintenance.process_offers_lifecycle();'
    );
    PERFORM cron.alter_job(
      job_id := (SELECT jobid FROM cron.job WHERE jobname = 'daily-process-offers-lifecycle'),
      active := false
    );
  END IF;
END $$;
