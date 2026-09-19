SELECT c.relname,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       r.rolname AS owner
FROM pg_class c
JOIN pg_roles r ON r.oid = c.relowner
WHERE c.oid = 'public.profiles'::regclass;
