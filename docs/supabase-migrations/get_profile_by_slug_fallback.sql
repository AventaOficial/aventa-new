-- Ampliar get_profile_by_slug: si no hay fila por slug en columna, intenta coincidir con el
-- slug derivado del display_name (misma idea que lib/profileSlug.ts).
--
-- IMPORTANTE:
-- 1) No uses CREATE OR REPLACE renombrando el parámetro (p. ej. slug → p_slug): Postgres devuelve
--    ERROR 42P13 "cannot change name of input parameter". Hay que DROP y CREATE.
-- 2) El parámetro debe seguir llamándose "slug" como en la migración original profiles_slug.sql.

DROP FUNCTION IF EXISTS public.get_profile_by_slug(text);

CREATE FUNCTION public.get_profile_by_slug(slug text)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s text := regexp_replace(
    lower(btrim(regexp_replace(coalesce(slug, ''), '\s+', '-', 'g'))),
    '[^a-z0-9-]',
    '',
    'g'
  );
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.profiles p
  WHERE p.slug IS NOT NULL
    AND btrim(p.slug) <> ''
    AND lower(btrim(p.slug)) = lower(btrim(slug))
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.profiles p
  WHERE (p.slug IS NULL OR btrim(coalesce(p.slug, '')) = '')
    AND regexp_replace(
      lower(btrim(regexp_replace(coalesce(p.display_name, ''), '\s+', '-', 'g'))),
      '[^a-z0-9-]',
      '',
      'g'
    ) = s
    AND s <> ''
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS 'Perfil por slug en columna; si está vacío, por slug derivado de display_name (alineado con el cliente).';

GRANT EXECUTE ON FUNCTION public.get_profile_by_slug(text) TO anon, authenticated;
