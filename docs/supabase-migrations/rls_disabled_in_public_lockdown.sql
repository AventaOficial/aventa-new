-- =============================================================================
-- AVENTA — RLS en tablas públicas sin protección (correo Supabase 17 ago 2026)
-- rls_disabled_in_public: cualquiera con la URL del proyecto podía leer/editar.
-- =============================================================================
-- QUÉ HACE:
--   1) Inventario de tablas public sin RLS
--   2) ENABLE ROW LEVEL SECURITY en todas las que falten
--   3) Policies de Plaza (por si se crearon las tablas sin el SQL original)
--   4) Lockdown de write_jobs_queue (solo service_role)
--
-- service_role (APIs de Next) BYPASSEA RLS. El feed sigue usando vistas + policies.
-- Ejecutar en Supabase → SQL Editor.
-- =============================================================================

-- 1) Inventario (revisá el resultado)
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relrowsecurity, c.relname;

-- 2) Activar RLS en CUALQUIER tabla public que aún no lo tenga
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch, c.relname AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND COALESCE(c.relrowsecurity, false) = false
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.sch, r.tbl);
  END LOOP;
END $$;

-- 3) Plaza: policies solo si las tablas existen
DO $$
BEGIN
  IF to_regclass('public.plaza_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.plaza_requests ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS plaza_requests_select_approved ON public.plaza_requests';
    EXECUTE $p$CREATE POLICY plaza_requests_select_approved ON public.plaza_requests
      FOR SELECT USING (status = 'approved' OR auth.uid() = user_id)$p$;
    EXECUTE 'DROP POLICY IF EXISTS plaza_requests_insert_own ON public.plaza_requests';
    EXECUTE $p$CREATE POLICY plaza_requests_insert_own ON public.plaza_requests
      FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
  IF to_regclass('public.plaza_discussions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.plaza_discussions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS plaza_discussions_select_approved ON public.plaza_discussions';
    EXECUTE $p$CREATE POLICY plaza_discussions_select_approved ON public.plaza_discussions
      FOR SELECT USING (status = 'approved' OR auth.uid() = user_id)$p$;
    EXECUTE 'DROP POLICY IF EXISTS plaza_discussions_insert_own ON public.plaza_discussions';
    EXECUTE $p$CREATE POLICY plaza_discussions_insert_own ON public.plaza_discussions
      FOR INSERT WITH CHECK (auth.uid() = user_id)$p$;
  END IF;
END $$;

-- 4) Cola interna: RLS on, sin policies, revoke a anon/authenticated
ALTER TABLE IF EXISTS public.write_jobs_queue ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF to_regclass('public.write_jobs_queue') IS NOT NULL THEN
    REVOKE ALL ON TABLE public.write_jobs_queue FROM PUBLIC;
    REVOKE ALL ON TABLE public.write_jobs_queue FROM anon;
    REVOKE ALL ON TABLE public.write_jobs_queue FROM authenticated;
  END IF;
END $$;

-- 5) Verificación: no deben quedar tablas public sin RLS
SELECT c.relname AS still_open
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND COALESCE(c.relrowsecurity, false) = false;
