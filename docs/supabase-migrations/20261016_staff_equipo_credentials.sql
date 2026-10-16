-- Beta (fase pruebas): última contraseña Team OS generada por el owner, visible solo vía API admin con service role.
-- Aplicar en Supabase antes de usar la columna «Contraseña para copiar» en /admin/team.

CREATE TABLE IF NOT EXISTS public.staff_equipo_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  temporary_password text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid NOT NULL REFERENCES auth.users (id)
);

ALTER TABLE public.staff_equipo_credentials ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.staff_equipo_credentials IS
  'Última contraseña temporal Team OS por usuario; lectura solo desde backend admin (owner).';
