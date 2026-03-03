-- Líderes / Cazadores: badge verificado y etiqueta ML para atribución en links.
-- Ejecutar en Supabase SQL Editor.

-- leader_badge: 'cazador_estrella' | 'cazador_aventa' | null. Si no null, se muestra badge en la app.
-- ml_tracking_tag: etiqueta de seguimiento para Mercado Libre (ej. 'aventa_capitanjeshua'). Se añade a los links ML de sus ofertas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS leader_badge text CHECK (leader_badge IS NULL OR leader_badge IN ('cazador_estrella', 'cazador_aventa')),
  ADD COLUMN IF NOT EXISTS ml_tracking_tag text;

COMMENT ON COLUMN public.profiles.leader_badge IS 'Badge visible: cazador_estrella o cazador_aventa. Null = usuario normal.';
COMMENT ON COLUMN public.profiles.ml_tracking_tag IS 'Etiqueta de seguimiento ML para links de ofertas de este usuario (solo si es líder).';

-- Después ejecutar: public_profiles_view_leader_ml.sql (la vista debe exponer leader_badge y ml_tracking_tag para evitar 400 en el feed).
