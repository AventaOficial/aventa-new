-- Auditoría: evitar full table scan en GET /api/profile/[username].
-- Función que resuelve un perfil por slug (misma normalización que el cliente: lower, espacios → guiones, solo [a-z0-9-]).
-- La API llamará a esta RPC en lugar de seleccionar todos los perfiles.

CREATE OR REPLACE FUNCTION public.get_profile_by_slug(slug text)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.profiles
  WHERE lower(regexp_replace(regexp_replace(trim(COALESCE(display_name, '')), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')) = lower(regexp_replace(nullif(trim(slug), ''), '[^a-z0-9-]', '', 'g'))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS 'Devuelve el perfil cuyo display_name normalizado (slug) coincide con el parámetro; para /api/profile/[username].';

-- Índice por expresión para no hacer full table scan cuando crezca la tabla
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_slug
  ON public.profiles (lower(regexp_replace(regexp_replace(trim(COALESCE(display_name, '')), '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g')))
  WHERE trim(COALESCE(display_name, '')) <> '';
