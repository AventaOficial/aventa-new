SELECT n.nspname AS schema,
       p.proname AS name,
       p.prosecdef AS security_definer,
       pg_get_functiondef(p.oid) AS def
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('handle_new_user', 'ensure_at_least_one_admin');
