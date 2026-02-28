-- Due diligence: un solo trigger en offer_votes para actualizar métricas en offers.
-- Eliminar offer_votes_counter_trigger y trg_offer_votes_recalculate (si llama a offer_votes_recalculate_function).
-- Dejar como única fuente de verdad: trigger que llama a recalculate_offer_metrics(p_offer_id).

-- Quitar triggers que puedan existir (counter por deltas o recalculate por SUM)
DROP TRIGGER IF EXISTS offer_votes_counter_trigger ON public.offer_votes;
DROP TRIGGER IF EXISTS trg_offer_votes_recalculate ON public.offer_votes;

-- Función que recalcula todas las métricas de la oferta (votes_count, up/down, ranking_momentum)
CREATE OR REPLACE FUNCTION public.trigger_recalculate_offer_on_vote()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_offer_metrics(OLD.offer_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalculate_offer_metrics(NEW.offer_id);
  RETURN NEW;
END;
$$;

-- Un único trigger tras INSERT/UPDATE/DELETE en offer_votes
CREATE TRIGGER trg_offer_votes_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.offer_votes
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recalculate_offer_on_vote();

COMMENT ON FUNCTION public.trigger_recalculate_offer_on_vote() IS 'Única fuente de verdad: actualiza offers (votes_count, upvotes_count, downvotes_count, ranking_momentum) vía recalculate_offer_metrics.';
