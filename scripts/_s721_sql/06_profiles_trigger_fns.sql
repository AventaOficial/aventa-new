SELECT n.nspname AS schema,
       p.proname AS name,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%no_zero_admin%'
   OR p.proname ILIKE '%profiles%'
ORDER BY 1, 2;
