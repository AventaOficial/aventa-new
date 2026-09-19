SELECT t.tgname,
       p.proname,
       n.nspname AS fn_schema,
       pg_get_triggerdef(t.oid, true) AS def
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace ns ON ns.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE ns.nspname = 'auth'
  AND c.relname = 'users'
  AND NOT t.tgisinternal
ORDER BY t.tgname;
