-- Ampliar get_profile_by_slug: si no hay fila por slug exacto, intenta coincidir con el
-- slug “derivado” del display_name (misma normalización que el front: lib/profileSlug.ts).
-- Así /u/pedro-perez y GET /api/profile/pedro-perez funcionan aunque slug en BD siga NULL.

CREATE OR REPLACE FUNCTION public.get_profile_by_slug(slug text)
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM (
    SELECT p.*, 1 AS _ord
    FROM public.profiles p
    WHERE p.slug IS NOT NULL
      AND btrim(p.slug) <> ''
      AND lower(btrim(p.slug)) = lower(btrim(get_profile_by_slug.slug))
    UNION ALL
    SELECT p.*, 2 AS _ord
    FROM public.profiles p
    WHERE (p.slug IS NULL OR btrim(coalesce(p.slug, '')) = '')
      AND regexp_replace(
        lower(btrim(regexp_replace(coalesce(p.display_name, ''), '\s+', '-', 'g'))),
        '[^a-z0-9-]',
        '',
        'g'
      ) = regexp_replace(
        lower(btrim(regexp_replace(coalesce(get_profile_by_slug.slug, ''), '\s+', '-', 'g'))),
        '[^a-z0-9-]',
        '',
        'g'
      )
      AND regexp_replace(
        lower(btrim(regexp_replace(coalesce(p.display_name, ''), '\s+', '-', 'g'))),
        '[^a-z0-9-]',
        '',
        'g'
      ) <> ''
  ) x
  ORDER BY x._ord
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS 'Perfil por slug; si slug vacío en BD, coincide con slug derivado de display_name (alineado con el cliente).';
