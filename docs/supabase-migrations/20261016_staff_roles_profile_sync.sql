-- Idempotent: staff rows in profiles.role → user_roles (canonical authorization).
-- Safe to re-run. Skips when production profiles has no role column (staff only in user_roles).
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'role'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    SELECT p.id, p.role
    FROM public.profiles p
    WHERE p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text, 'finance'::text])
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role = p.role
      );
  END IF;
END
$migration$;
