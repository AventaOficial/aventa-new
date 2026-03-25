-- Peso de voto positivo por usuario (solo ajustable vía admin owner; default 1).
-- Cada like suma 2 * vote_weight_multiplier al ranking_momentum de la oferta.
-- Ejecutar en Supabase SQL Editor después de backup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vote_weight_multiplier integer NOT NULL DEFAULT 1
  CHECK (vote_weight_multiplier >= 1 AND vote_weight_multiplier <= 1000);

COMMENT ON COLUMN public.profiles.vote_weight_multiplier IS 'Multiplicador del peso base del like (2) en ranking_momentum. Solo owner vía admin.';

-- Reemplaza recalculate_offer_metrics para usar peso por votante.
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
  v_up_weighted numeric;
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

  SELECT COALESCE(SUM(2::numeric * COALESCE(p.vote_weight_multiplier, 1)::numeric), 0) INTO v_up_weighted
  FROM public.offer_votes ov
  LEFT JOIN public.profiles p ON p.id = ov.user_id
  WHERE ov.offer_id = p_offer_id AND ov.value IN (1, 2);

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

  v_ranking_momentum := v_up_weighted - v_downvotes_count;

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

-- Recalcular ofertas donde votó un usuario (tras cambiar su multiplicador).
CREATE OR REPLACE FUNCTION public.recalculate_offers_for_voter(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT offer_id FROM public.offer_votes WHERE user_id = p_user_id
  LOOP
    PERFORM public.recalculate_offer_metrics(r.offer_id);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_offers_for_voter(uuid) TO service_role;

-- Recalcular todas las ofertas con votos (aplicar nueva fórmula).
SELECT public.recalculate_offer_metrics(id) FROM public.offers WHERE id IN (SELECT DISTINCT offer_id FROM public.offer_votes);
