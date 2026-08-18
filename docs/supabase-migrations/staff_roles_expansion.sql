-- Roles staff ampliados (gerente, finance, marketing).
-- La columna user_roles.role es text sin CHECK estricto en la mayoría de despliegues.
-- Si tu proyecto tiene CHECK, amplíalo manualmente.

COMMENT ON TABLE public.user_roles IS
  'Roles: owner, admin, gerente, finance, marketing, moderator, analyst. Hub /equipo vs /admin según rol.';
