SELECT tgname,
       pg_get_triggerdef(oid, true) AS def,
       tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.profiles'::regclass
  AND NOT tgisinternal
ORDER BY tgname;
