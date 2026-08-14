-- Tags de atribución por creador (ML + Amazon) para comisiones.
-- Prereq: profiles con ml_tracking_tag; public_profiles_view ya existente.
-- Ejecutar en Supabase SQL Editor.
--
-- Nota: Postgres NO permite CREATE OR REPLACE VIEW si insertás una columna
-- en medio (cambia el nombre de la posición). Por eso DROP + CREATE.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS amazon_tracking_tag text;

COMMENT ON COLUMN public.profiles.amazon_tracking_tag IS
  'Amazon Associates tag del creador (ej. aventa-20). Se aplica a links amazon.* de sus ofertas.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_ml_tracking_tag_unique
  ON public.profiles (lower(btrim(ml_tracking_tag)))
  WHERE ml_tracking_tag IS NOT NULL AND btrim(ml_tracking_tag) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_amazon_tracking_tag_unique
  ON public.profiles (lower(btrim(amazon_tracking_tag)))
  WHERE amazon_tracking_tag IS NOT NULL AND btrim(amazon_tracking_tag) <> '';

-- Orden histórico de columnas + amazon al final (compat + nueva).
DROP VIEW IF EXISTS public.public_profiles_view;

CREATE VIEW public.public_profiles_view
WITH (security_invoker = true)
AS
SELECT
  id,
  display_name,
  avatar_url,
  leader_badge,
  ml_tracking_tag,
  slug,
  amazon_tracking_tag
FROM public.profiles;

COMMENT ON VIEW public.public_profiles_view IS
  'Perfil público para joins: display_name, avatar, badges, ml/amazon tags, slug. security_invoker.';

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;

-- Smoke:
-- SELECT id, display_name, ml_tracking_tag, slug, amazon_tracking_tag
-- FROM public.public_profiles_view LIMIT 3;
