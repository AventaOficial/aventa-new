-- Pesos en offer_votes según nivel del VOTANTE (reputation_level en profiles):
-- Nivel 1: +2 / −1, 2: +4 / −2, 3: +8 / −4, 4: +12 / −6.
-- La API (POST /api/votes) envía direction 'up'|'down'; el valor insertado debe estar en este CHECK.
-- ranking_momentum en offers = SUM(value); upvotes_count/downvotes_count = nº de votantes (value>0 / value<0).

BEGIN;

ALTER TABLE public.offer_votes DROP CONSTRAINT IF EXISTS offer_votes_value_check;
ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[2, 4, 8, 12, -1, -2, -4, -6]));

COMMIT;

-- Sustituye recalculate_offer_metrics: contar cabezas y momentum por suma ponderada.
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
  WHERE offer_id = p_offer_id AND value > 0;

  SELECT COUNT(*) INTO v_downvotes_count
  FROM public.offer_votes
  WHERE offer_id = p_offer_id AND value < 0;

  SELECT COALESCE(SUM(value), 0) INTO v_ranking_momentum
  FROM public.offer_votes
  WHERE offer_id = p_offer_id;

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

-- Recalcular todas las ofertas con votos (ajusta contadores y momentum).
-- SELECT public.recalculate_offer_metrics(id) FROM public.offers WHERE id IN (SELECT DISTINCT offer_id FROM public.offer_votes);
