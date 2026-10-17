-- Idempotent: copia roles staff legibles a membresías Team OS.
-- NO toca filas `owner` en user_roles. NO elimina user_roles.
-- SKIP explícito: admin, gerente (requieren decisión humana).

INSERT INTO public.team_memberships (
  user_id,
  team_id,
  role,
  status,
  assigned_by,
  status_changed_by,
  created_at,
  updated_at,
  status_changed_at
)
SELECT
  ur.user_id,
  v.team_id,
  v.team_role,
  'ACTIVE',
  ur.user_id,
  ur.user_id,
  now(),
  now(),
  now()
FROM public.user_roles ur
JOIN (
  VALUES
    ('moderator', 'moderation', 'moderator'),
    ('marketing', 'growth', 'growth_member'),
    ('finance', 'finance', 'finance_viewer'),
    ('analyst', 'operations', 'operations_member')
) AS v(staff_role, team_id, team_role) ON v.staff_role = ur.role
WHERE NOT EXISTS (
  SELECT 1
  FROM public.team_memberships m
  WHERE m.user_id = ur.user_id
    AND m.team_id = v.team_id
    AND m.status IN ('ACTIVE', 'SUSPENDED')
);

COMMENT ON TABLE public.user_roles IS
  'Autoridad global: solo `owner` debe permanecer operativo tras migración staff→Team OS.';
