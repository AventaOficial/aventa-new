-- Tabla de avisos (anuncios del sitio). Solo owner/admin crean/editan; todos leen los activos.

CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  link text,
  active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_announcements_active_sort
  ON public.announcements (active, sort_order DESC, created_at DESC);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquiera puede ver avisos activos
CREATE POLICY "announcements_select_active"
  ON public.announcements FOR SELECT
  USING (active = true);

-- Inserción/actualización/borrado: solo con service_role o desde API con verificación admin/owner
-- (la API usa service role; no exponemos escritura directa desde anon/authenticated)
CREATE POLICY "announcements_all_service_role"
  ON public.announcements FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.announcements IS 'Avisos del sitio (ej. Descubre AVENTA, activa correos). Solo activos visibles en la campana.';
