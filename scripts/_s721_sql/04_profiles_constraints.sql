SELECT conname,
       pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass
ORDER BY contype, conname;
