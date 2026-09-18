-- =============================================================================
-- AVENTA STAGING W1.5 — RLS grants lockdown (oojshofrpbfwsiypcecr ONLY)
-- Date: 2026-09-17
-- =============================================================================
-- PURPOSE: Align staging grants with production lockdown for:
--   offer_events, write_jobs_queue, app_config
--
-- PRODUCTION FACT (READ-ONLY inventory mkgsrpsuvedwwlzmzmzh):
--   RLS enabled = true
--   policy_count = 0 for all three tables
--   Grants: postgres + service_role only (no anon/authenticated)
--
-- EVIDENCE (repo migrations applied historically on prod):
--   docs/supabase-migrations/20260830_beta_security_lockdown.sql  (offer_events)
--   docs/supabase-migrations/security_advisor_phase1_lockdown.sql  (write_jobs_queue)
--   docs/supabase-migrations/security_audit_lockdown_2026_08_18.sql (app_config)
--
-- INTENTIONAL: 0 client policies (deny-by-default under RLS).
-- service_role BYPASSRLS → Next.js createServerClient paths continue to work.
--
-- FORBIDDEN: DROP/TRUNCATE, production project-ref, inventing SELECT policies.
-- =============================================================================

-- Abort guard (manual): only run when connected to oojshofrpbfwsiypcecr

ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.offer_events FROM PUBLIC;
REVOKE ALL ON TABLE public.offer_events FROM anon;
REVOKE ALL ON TABLE public.offer_events FROM authenticated;
GRANT ALL ON TABLE public.offer_events TO service_role;

ALTER TABLE public.write_jobs_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.write_jobs_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.write_jobs_queue FROM anon;
REVOKE ALL ON TABLE public.write_jobs_queue FROM authenticated;
GRANT ALL ON TABLE public.write_jobs_queue TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'write_jobs_queue_id_seq'
  ) THEN
    EXECUTE 'REVOKE ALL ON SEQUENCE public.write_jobs_queue_id_seq FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON SEQUENCE public.write_jobs_queue_id_seq FROM anon';
    EXECUTE 'REVOKE ALL ON SEQUENCE public.write_jobs_queue_id_seq FROM authenticated';
  END IF;
END $$;

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_config FROM PUBLIC;
REVOKE ALL ON TABLE public.app_config FROM anon;
REVOKE ALL ON TABLE public.app_config FROM authenticated;
GRANT ALL ON TABLE public.app_config TO service_role;

-- No CREATE POLICY — matching production (0 policies).
