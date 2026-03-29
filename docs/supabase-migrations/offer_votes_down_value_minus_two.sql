-- Voto abajo: value = -2 (antes -1), mismo peso absoluto que like +2.
-- App / API: POST /api/votes con value 2 | -2. Score UI: 2 * (upvotes_count - downvotes_count).
-- Ejecutar en Supabase SQL Editor tras backup.

BEGIN;

UPDATE public.offer_votes SET value = -2 WHERE value = -1;

ALTER TABLE public.offer_votes DROP CONSTRAINT IF EXISTS offer_votes_value_check;
ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[2, -2]));

COMMIT;

-- --- Ajustar recalculate_offer_metrics (elige según lo que tengas en producción) ---
--
-- A) Función simple (offer_votes_trigger_upvotes_value_2.sql):
--    - Contar down: WHERE value = -2  (ya no uses -1)
--    - v_ranking_momentum := (v_upvotes_count * 2) - (v_downvotes_count * 2);
--
-- B) Con vote_weight_multiplier (profiles_vote_weight_multiplier.sql):
--    - Contar down: WHERE value = -2
--    - v_ranking_momentum := v_up_weighted - (v_downvotes_count * 2);
--
-- Tras editar la función en el editor SQL:
-- SELECT public.recalculate_offer_metrics(id) FROM public.offers WHERE id IN (SELECT DISTINCT offer_id FROM public.offer_votes);

-- Reputación ponderada: dislike simétrico al like (mismo escalón, signo negativo)
CREATE OR REPLACE FUNCTION public.recalculate_offer_reputation_weighted_score(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_score numeric;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN v.value IN (1, 2) THEN CASE COALESCE(p.reputation_level, 1)
        WHEN 1 THEN 2 WHEN 2 THEN 2.2 WHEN 3 THEN 2.5 WHEN 4 THEN 3 ELSE 2 END
      WHEN v.value = -2 THEN -1 * (CASE COALESCE(p.reputation_level, 1)
        WHEN 1 THEN 2 WHEN 2 THEN 2.2 WHEN 3 THEN 2.5 WHEN 4 THEN 3 ELSE 2 END)
      ELSE 0
    END
  ), 0) INTO v_score
  FROM public.offer_votes v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  WHERE v.offer_id = p_offer_id;

  UPDATE public.offers SET reputation_weighted_score = v_score WHERE id = p_offer_id;
END;
$$;
