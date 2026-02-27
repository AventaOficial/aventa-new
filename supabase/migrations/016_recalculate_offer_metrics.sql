CREATE OR REPLACE FUNCTION public.recalculate_offer_metrics(p_offer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH m AS (
    SELECT
      (SELECT COUNT(*)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS votes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = 1) - COUNT(*) FILTER (WHERE value = -1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS score,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'outbound'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS outbound_24h,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'view'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS views_24h
  )
  UPDATE public.offers o
  SET
    votes_count = COALESCE(m.votes_count, 0),
    outbound_24h = COALESCE(m.outbound_24h, 0),
    ctr_24h = CASE WHEN COALESCE(m.views_24h, 0) > 0 THEN ROUND((COALESCE(m.outbound_24h, 0)::numeric / NULLIF(m.views_24h, 0)) * 100, 2) ELSE 0 END,
    ranking_momentum = (
      COALESCE(m.score, 0)
      + (COALESCE(m.outbound_24h, 0) * 0.3)
      + (CASE WHEN COALESCE(m.views_24h, 0) > 0 THEN (COALESCE(m.outbound_24h, 0)::numeric / NULLIF(m.views_24h, 0)) * 100 * 0.5 ELSE 0 END)
    )
  FROM m
  WHERE o.id = p_offer_id;
$$;
