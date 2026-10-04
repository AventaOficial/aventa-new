-- Views in public are read surfaces for anon/authenticated.
-- Supabase default privileges grant INSERT/UPDATE/DELETE to anon/authenticated on every new
-- relation, so each DROP VIEW + CREATE VIEW re-opens writes. A single-table view is
-- auto-updatable, and a view owned by postgres without security_invoker writes its base
-- table bypassing RLS (ofertas_ranked_general -> offers allowed anonymous UPDATE/INSERT).
--
-- 1. Revoke client write privileges on every view and materialized view in public.
--    SELECT grants are untouched (feed and search read the views).
-- 2. public.client_writable_views() lists any view still writable by anon/authenticated;
--    the system-integrity check security.client_writable_views fails when it returns rows.
--
-- Re-run after any CREATE VIEW in public. Idempotent.

SET lock_timeout = '5s';

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM PUBLIC, anon, authenticated',
      r.relname
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.client_writable_views()
RETURNS TABLE (view_name text, role_name text, privilege text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT c.relname::text, r.role_name, p.privilege
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role_name)
  CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE')) AS p(privilege)
  WHERE n.nspname = 'public'
    AND c.relkind IN ('v', 'm')
    AND pg_catalog.has_table_privilege(r.role_name, c.oid, p.privilege)
  ORDER BY 1, 2, 3;
$$;

REVOKE ALL ON FUNCTION public.client_writable_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.client_writable_views() TO service_role;
