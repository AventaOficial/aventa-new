-- =============================================================================
-- AVENTA — Security Advisor fase 1 (lockdown seguro)
-- Doc: docs/SUPABASE_SECURITY_ADVISOR.md
-- =============================================================================
-- QUÉ HACE:
--   A) Inventario (solo lectura) — ejecutá primero y revisá resultados
--   B) RLS + REVOKE en write_jobs_queue (la app solo usa service_role)
--   C) DROP de vistas backup / legado SOLO si el inventario confirma que existen
--      y la app no las usa (código actual: 0 referencias)
--
-- QUÉ NO HACE (a propósito):
--   - No toca ofertas_ranked_general ni public_profiles_view (rompen el feed)
--   - No pone security_invoker en vistas vivas (fase 2, probar en staging)
--   - No dropea daily_system_metrics (la usa /admin/health)
--
-- Ejecutar en Supabase → SQL Editor. Preferible en horario no pico.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) INVENTARIO — corré esto primero (no modifica nada)
-- -----------------------------------------------------------------------------

-- Vistas sospechosas del linter
SELECT n.nspname AS schema, c.relname AS view_name, c.relkind
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN (
    'ofertas_ranked_general',
    'ofertas_ranked_general_backup',
    'ofertas_ranked_general_backup_20260223_055849',
    'public_profiles_view',
    'public_profiles_view_backup',
    'ofertas_scores',
    'ofertas_scores_ranked',
    'offer_vote_totals',
    'offer_event_totals',
    'daily_system_metrics'
  )
ORDER BY c.relname;

-- RLS actual de la cola
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'write_jobs_queue';

-- Grants actuales en la cola (si falla “no existe”, la tabla aún no está)
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'write_jobs_queue'
ORDER BY grantee, privilege_type;

-- -----------------------------------------------------------------------------
-- B) write_jobs_queue — mismo patrón que affiliate_ledger / communities lockdown
-- -----------------------------------------------------------------------------
-- service_role (Next.js createServerClient) BYPASSEA RLS → enqueue/cron siguen OK.
-- anon / authenticated dejan de poder leer/escribir la cola vía PostgREST.

ALTER TABLE IF EXISTS public.write_jobs_queue ENABLE ROW LEVEL SECURITY;

-- Sin policies: nadie bajo RLS ve filas. service_role no aplica RLS.
REVOKE ALL ON TABLE public.write_jobs_queue FROM PUBLIC;
REVOKE ALL ON TABLE public.write_jobs_queue FROM anon;
REVOKE ALL ON TABLE public.write_jobs_queue FROM authenticated;

-- Secuencia del BIGSERIAL (por si quedó granted a roles públicos)
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

COMMENT ON TABLE public.write_jobs_queue IS
  'Cola interna de eventos. Solo service_role. RLS on sin policies (2026-08-14).';

-- -----------------------------------------------------------------------------
-- C) DROP vistas muertas / backup
-- -----------------------------------------------------------------------------
-- Seguro respecto al código de la app (ningún .from('…backup') / ofertas_scores).
-- Si el inventario A no listó alguna, el IF EXISTS no falla.

DROP VIEW IF EXISTS public.ofertas_ranked_general_backup CASCADE;
DROP VIEW IF EXISTS public.ofertas_ranked_general_backup_20260223_055849 CASCADE;
DROP VIEW IF EXISTS public.public_profiles_view_backup CASCADE;
DROP VIEW IF EXISTS public.ofertas_scores CASCADE;
DROP VIEW IF EXISTS public.ofertas_scores_ranked CASCADE;
DROP VIEW IF EXISTS public.offer_vote_totals CASCADE;
DROP VIEW IF EXISTS public.offer_event_totals CASCADE;

-- NO ejecutar:
-- DROP VIEW public.ofertas_ranked_general;
-- DROP VIEW public.public_profiles_view;
-- DROP VIEW public.daily_system_metrics;

-- -----------------------------------------------------------------------------
-- D) Verificación rápida post-cambio
-- -----------------------------------------------------------------------------
SELECT c.relname, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'write_jobs_queue';

SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname LIKE '%backup%';

-- =============================================================================
-- FASE 2 (NO incluido — documentado en SUPABASE_SECURITY_ADVISOR.md):
--   - Mover lectura de daily_system_metrics a API admin con service_role
--   - Probar CREATE OR REPLACE VIEW ... WITH (security_invoker = true) en staging
--   - Auditar policies de offers/profiles antes de invoker en producción
-- =============================================================================
