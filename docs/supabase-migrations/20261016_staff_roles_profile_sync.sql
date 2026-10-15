-- Idempotent: staff rows in profiles.role → user_roles (canonical authorization).
-- Safe to re-run; matches STAGING_W1_RECONCILIATION seed pattern.
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, p.role
FROM public.profiles p
WHERE p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text, 'finance'::text])
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p.id AND ur.role = p.role
  );
