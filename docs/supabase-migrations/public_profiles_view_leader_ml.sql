-- Incluir leader_badge y ml_tracking_tag en la vista pública de perfiles.
-- Necesario para que las queries que usan public_profiles_view!created_by(..., leader_badge, ml_tracking_tag) no devuelvan 400.
-- Ejecutar en Supabase SQL Editor después de profiles_leader_badge_ml_tag.sql.

CREATE OR REPLACE VIEW public.public_profiles_view AS
SELECT
  id,
  display_name,
  avatar_url,
  leader_badge,
  ml_tracking_tag,
  slug
FROM public.profiles;

COMMENT ON VIEW public.public_profiles_view IS 'Vista pública para joins (ofertas, comentarios). leader_badge, ml_tracking_tag, slug (enlace /u/[slug]). Requiere columna profiles.slug (profiles_slug.sql).';

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;
