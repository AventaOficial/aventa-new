SELECT polname,
       polcmd,
       polroles::regrole[] AS roles,
       pg_get_expr(polqual, polrelid) AS using_expr,
       pg_get_expr(polwithcheck, polrelid) AS with_check,
       polpermissive
FROM pg_policy
WHERE polrelid = 'public.profiles'::regclass
ORDER BY polname;
