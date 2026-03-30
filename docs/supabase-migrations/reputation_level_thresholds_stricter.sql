-- Umbrales de nivel más exigentes (reemplaza reputation_level_from_score).
-- Antes: L2≥50, L3≥200, L4≥500
-- Ahora: L2≥100, L3≥400, L4≥1000
-- Ejecutar en Supabase SQL Editor tras deploy del front.
-- Opcional: recalcular niveles existentes:
--   SELECT public.recalculate_user_reputation(id) FROM public.profiles;

CREATE OR REPLACE FUNCTION public.reputation_level_from_score(score integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN score >= 1000 THEN 4
    WHEN score >= 400 THEN 3
    WHEN score >= 100 THEN 2
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.reputation_level_from_score(integer) IS
  'Nivel 1: 0-99, 2: 100-399, 3: 400-999, 4: 1000+';
