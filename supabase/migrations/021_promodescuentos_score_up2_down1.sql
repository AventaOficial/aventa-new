-- Modelo de score: upvote = +2, downvote = -1
-- Score = (upvotes * 2) - (downvotes * 1)
-- Incentiva votos positivos; downvotes penalizan menos.

CREATE OR REPLACE FUNCTION public.recalculate_offer_metrics(p_offer_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH m AS (
    SELECT
      (SELECT COUNT(*)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS votes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = 1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS upvotes_count,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = -1), 0)::int FROM public.offer_votes WHERE offer_id = p_offer_id) AS downvotes_count,
      -- Score: up +2, down -1
      (SELECT COALESCE(COUNT(*) FILTER (WHERE value = 1), 0) * 2 - COALESCE(COUNT(*) FILTER (WHERE value = -1), 0) FROM public.offer_votes WHERE offer_id = p_offer_id)::int AS score,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'outbound'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS outbound_24h,
      (SELECT COALESCE(COUNT(*) FILTER (WHERE event_type = 'view'), 0)::int FROM public.offer_events WHERE offer_id = p_offer_id AND created_at >= now() - interval '24 hours') AS views_24h
  )
  UPDATE public.offers o
  SET
    votes_count = COALESCE(m.votes_count, 0),
    upvotes_count = COALESCE(m.upvotes_count, 0),
    downvotes_count = COALESCE(m.downvotes_count, 0),
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

-- Vista: score con up*2 - down*1
CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.store,
  o.offer_url,
  o.description,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
