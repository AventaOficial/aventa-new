-- =============================================================================
-- AVENTA — Security Advisor fase 2 (security_invoker + policies mínimas)
-- Doc: docs/SUPABASE_SECURITY_ADVISOR.md
-- Prereq: fase 1 aplicada (cola + drop backups)
-- =============================================================================
-- QUÉ HACE:
--   1) Policies SELECT mínimas en offers/profiles para que el feed siga
--      funcionando con security_invoker.
--   2) ALTER VIEW ... SET (security_invoker = true) en las 3 vistas del linter.
--   3) REVOKE de daily_system_metrics a anon/authenticated (leer vía API admin).
--
-- DESPUÉS DE EJECUTAR:
--   - Abrí el home (feed) logueado y sin loguear.
--   - Abrí /admin/health (métricas deben venir por API).
--   - Recargá Database Linter → esas 3 Critical deberían desaparecer.
--
-- ROLLBACK (si el feed se rompe):
--   ALTER VIEW public.ofertas_ranked_general SET (security_invoker = false);
--   ALTER VIEW public.public_profiles_view SET (security_invoker = false);
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0) Inventario rápido
-- -----------------------------------------------------------------------------
SELECT c.relname AS view_name,
       COALESCE(c.reloptions::text, '') AS reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'v'
  AND c.relname IN (
    'ofertas_ranked_general',
    'public_profiles_view',
    'daily_system_metrics'
  )
ORDER BY 1;

SELECT tablename, policyname, cmd, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('offers', 'profiles')
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- 1) RLS + policies SELECT (idempotente) — necesarias con security_invoker
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;

-- Ofertas visibles en feed / ficha pública
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'offers' AND policyname = 'offers_public_read_approved'
  ) THEN
    CREATE POLICY offers_public_read_approved
      ON public.offers
      FOR SELECT
      TO anon, authenticated
      USING (status IN ('approved', 'published'));
  END IF;
END $$;

-- Autor puede leer sus propias ofertas (cualquier status) — útil para /me
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'offers' AND policyname = 'offers_owner_read_own'
  ) THEN
    CREATE POLICY offers_owner_read_own
      ON public.offers
      FOR SELECT
      TO authenticated
      USING (created_by = auth.uid());
  END IF;
END $$;

-- Perfiles: lectura pública de filas (columnas sensibles se controlan por GRANT / no están en la vista)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_public_read'
  ) THEN
    CREATE POLICY profiles_public_read
      ON public.profiles
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;

-- Lectura de tabla base requerida por el invoker de la vista
GRANT SELECT ON TABLE public.offers TO anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

-- Endurecer: quitar SELECT de columnas fiscales a roles públicos (si existen las columnas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'commission_rfc'
  ) THEN
    EXECUTE 'REVOKE SELECT (commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at) ON public.profiles FROM anon';
    EXECUTE 'REVOKE SELECT (commission_legal_name, commission_rfc, commission_clabe, commission_fiscal_updated_at) ON public.profiles FROM authenticated';
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'REVOKE fiscal columns skipped: %', SQLERRM;
END $$;

-- -----------------------------------------------------------------------------
-- 2) security_invoker en las 3 vistas del linter (Postgres 15+)
-- -----------------------------------------------------------------------------
ALTER VIEW public.ofertas_ranked_general SET (security_invoker = true);
ALTER VIEW public.public_profiles_view SET (security_invoker = true);

-- daily_system_metrics: existe en prod pero no siempre en migraciones del repo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v' AND c.relname = 'daily_system_metrics'
  ) THEN
    EXECUTE 'ALTER VIEW public.daily_system_metrics SET (security_invoker = true)';
    EXECUTE 'REVOKE ALL ON TABLE public.daily_system_metrics FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON TABLE public.daily_system_metrics FROM anon';
    EXECUTE 'REVOKE ALL ON TABLE public.daily_system_metrics FROM authenticated';
    -- service_role sigue pudiendo leer (bypass / privilegios de rol)
  END IF;
END $$;

COMMENT ON VIEW public.ofertas_ranked_general IS
  'Feed ranking. security_invoker=true (2026-08-14). Requiere policy offers_public_read_approved.';
COMMENT ON VIEW public.public_profiles_view IS
  'Perfil público para joins. security_invoker=true (2026-08-14). Solo columnas no fiscales.';

-- -----------------------------------------------------------------------------
-- 3) Verificación
-- -----------------------------------------------------------------------------
SELECT c.relname AS view_name, c.reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('ofertas_ranked_general', 'public_profiles_view', 'daily_system_metrics');

-- Smoke (debe devolver filas si hay ofertas publicadas):
-- SELECT id, title, status FROM public.ofertas_ranked_general LIMIT 3;
-- SELECT id, display_name FROM public.public_profiles_view LIMIT 3;
