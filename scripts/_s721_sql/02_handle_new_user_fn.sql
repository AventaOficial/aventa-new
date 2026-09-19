SELECT n.nspname AS schema,
       p.proname AS name,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname ILIKE '%new_user%'
   OR p.proname ILIKE '%handle_new%'
   OR p.proname ILIKE '%create_profile%'
ORDER BY 1, 2;
