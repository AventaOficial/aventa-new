-- Slug público para perfiles (para /u/[slug] y que usuarios Google funcionen igual).
-- get_profile_by_slug debe existir y hacer SELECT por slug; si no existe, créalo al final.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slug text;

-- Índice para búsqueda por slug
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key ON public.profiles (slug) WHERE slug IS NOT NULL AND slug <> '';

-- Rellenar slug desde display_name (misma lógica que frontend: minúsculas, espacios→-, solo a-z0-9-)
UPDATE public.profiles
SET slug = REGEXP_REPLACE(
  LOWER(TRIM(REGEXP_REPLACE(COALESCE(display_name, ''), '\s+', '-', 'g'))),
  '[^a-z0-9-]', '', 'g'
)
WHERE (slug IS NULL OR slug = '')
  AND display_name IS NOT NULL
  AND TRIM(display_name) <> '';

-- RPC para obtener perfil por slug (por si no existía)
CREATE OR REPLACE FUNCTION public.get_profile_by_slug(slug text)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles
  WHERE public.profiles.slug = get_profile_by_slug.slug
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS 'Busca perfil por slug (para /u/[username])';
GRANT EXECUTE ON FUNCTION public.get_profile_by_slug(text) TO anon, authenticated;
