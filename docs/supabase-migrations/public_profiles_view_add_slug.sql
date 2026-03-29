-- Expone profiles.slug en la vista pública para que enlaces "Cazado por" usen el mismo slug que get_profile_by_slug.
-- Ejecutar en Supabase SQL Editor (requiere columna profiles.slug, ver profiles_slug.sql).

CREATE OR REPLACE VIEW public.public_profiles_view AS
SELECT
  id,
  display_name,
  avatar_url,
  leader_badge,
  ml_tracking_tag,
  slug
FROM public.profiles;

COMMENT ON VIEW public.public_profiles_view IS 'Vista pública para joins: display_name, avatar, badges, ml_tracking_tag, slug (perfil /u/[slug]).';

GRANT SELECT ON public.public_profiles_view TO anon, authenticated;
