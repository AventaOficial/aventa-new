-- Peso de voto progresivo por reputación (backend only).
-- Nivel 1: +2/-1, 2: +2.2/-1.1, 3: +2.5/-1.2, 4: +3/-1.5
-- No reemplaza el trigger existente de votos; solo añade esta columna y su actualización.

-- 1) Columna en offers (nullable para no romper datos existentes)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS reputation_weighted_score numeric;

-- 2) Función que recalcula el score ponderado de un oferta
CREATE OR REPLACE FUNCTION public.recalculate_offer_reputation_weighted_score(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_score numeric;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN v.value = 1 THEN CASE COALESCE(p.reputation_level, 1)
        WHEN 1 THEN 2 WHEN 2 THEN 2.2 WHEN 3 THEN 2.5 WHEN 4 THEN 3 ELSE 2 END
      WHEN v.value = -1 THEN CASE COALESCE(p.reputation_level, 1)
        WHEN 1 THEN 1 WHEN 2 THEN 1.1 WHEN 3 THEN 1.2 WHEN 4 THEN 1.5 ELSE 1 END
      ELSE 0
    END
  ), 0) INTO v_score
  FROM public.offer_votes v
  LEFT JOIN public.profiles p ON p.id = v.user_id
  WHERE v.offer_id = p_offer_id;

  UPDATE public.offers
  SET reputation_weighted_score = v_score
  WHERE id = p_offer_id;
END;
$$;

-- 3) Trigger: al cambiar offer_votes, recalcular reputation_weighted_score de esa oferta
CREATE OR REPLACE FUNCTION public.trg_offer_votes_reputation_weighted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_offer_reputation_weighted_score(OLD.offer_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalculate_offer_reputation_weighted_score(NEW.offer_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS offer_votes_reputation_weighted_trigger ON public.offer_votes;
CREATE TRIGGER offer_votes_reputation_weighted_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.offer_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_offer_votes_reputation_weighted();

-- Opcional: backfill para ofertas existentes (puede ser lento con muchas filas)
-- SELECT public.recalculate_offer_reputation_weighted_score(id) FROM public.offers;
