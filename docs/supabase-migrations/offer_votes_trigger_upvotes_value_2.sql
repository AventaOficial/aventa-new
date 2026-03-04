-- Trigger y función para que upvotes_count/downvotes_count cuenten value = 2 (y 1) como like.
-- Ejecutar en Supabase SQL Editor. Si ya tienes recalculate_offer_metrics, esto la reemplaza con la lógica correcta.
-- Si tu tabla offers no tiene outbound_24h, ctr_24h o ranking_momentum, comenta esas líneas del UPDATE (aprox. 65-67).

-- 1) Función que recalcula contadores de votos (y opcionalmente otras métricas) de la oferta.
CREATE OR REPLACE FUNCTION public.recalculate_offer_metrics(p_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_votes_count int;
  v_upvotes_count int;
  v_downvotes_count int;
  v_outbound_24h int;
  v_views_24h int;
  v_ctr_24h numeric;
  v_ranking_momentum numeric;
BEGIN
  SELECT COUNT(*) INTO v_votes_count
  FROM public.offer_votes
  WHERE offer_id = p_offer_id;

  SELECT COUNT(*) INTO v_upvotes_count
  FROM public.offer_votes
  WHERE offer_id = p_offer_id AND value IN (1, 2);

  SELECT COUNT(*) INTO v_downvotes_count
  FROM public.offer_votes
  WHERE offer_id = p_offer_id AND value = -1;

  -- outbound_24h y ctr_24h (si la tabla offer_events existe y tiene event_type)
  BEGIN
    SELECT COUNT(*) INTO v_outbound_24h
    FROM public.offer_events
    WHERE offer_id = p_offer_id
      AND event_type = 'outbound'
      AND created_at >= (now() - interval '24 hours');

    SELECT COUNT(*) INTO v_views_24h
    FROM public.offer_events
    WHERE offer_id = p_offer_id
      AND event_type = 'view'
      AND created_at >= (now() - interval '24 hours');

    IF v_views_24h > 0 THEN
      v_ctr_24h := round((v_outbound_24h::numeric / v_views_24h::numeric)::numeric, 4);
    ELSE
      v_ctr_24h := 0;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_outbound_24h := 0;
    v_views_24h := 0;
    v_ctr_24h := 0;
  END;

  -- ranking_momentum: upvotes*2 - downvotes (un like vale 2)
  v_ranking_momentum := (v_upvotes_count * 2) - v_downvotes_count;

  UPDATE public.offers
  SET
    votes_count = v_votes_count,
    upvotes_count = v_upvotes_count,
    downvotes_count = v_downvotes_count,
    outbound_24h = COALESCE(v_outbound_24h, 0),
    ctr_24h = COALESCE(v_ctr_24h, 0),
    ranking_momentum = v_ranking_momentum
  WHERE id = p_offer_id;
END;
$$;

-- 2) Función del trigger (se ejecuta por cada fila en offer_votes).
CREATE OR REPLACE FUNCTION public.trigger_recalculate_offer_on_vote()
RETURNS trigger
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

-- 3) Quitar el trigger antiguo si existe (por si tiene otro nombre).
DROP TRIGGER IF EXISTS trg_offer_votes_recalculate ON public.offer_votes;

-- 4) Crear el trigger.
CREATE TRIGGER trg_offer_votes_recalculate
  AFTER INSERT OR UPDATE OR DELETE ON public.offer_votes
  FOR EACH ROW
  EXECUTE PROCEDURE public.trigger_recalculate_offer_on_vote();

-- 5) Recalcular todas las ofertas que tienen votos (para corregir contadores ya existentes).
SELECT public.recalculate_offer_metrics(id) FROM public.offers WHERE id IN (SELECT DISTINCT offer_id FROM public.offer_votes);
