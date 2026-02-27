-- Roles AVENTA: owner > admin > moderator > analyst
-- owner: acceso total (dueño)
-- admin: acceso total
-- moderator: solo moderación (Pendientes, Aprobadas, Rechazadas, Reportes, Usuarios, Logs)
-- analyst: solo Métricas y Health

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Constraint de roles válidos
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN ('owner', 'admin', 'moderator', 'analyst'));

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven su propio rol" ON public.user_roles;
CREATE POLICY "Usuarios ven su propio rol" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.user_roles IS 'Roles: owner (todo), admin (todo), moderator (solo moderación), analyst (solo métricas)';
