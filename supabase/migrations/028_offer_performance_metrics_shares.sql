-- Añadir shares a offer_performance_metrics
DROP MATERIALIZED VIEW IF EXISTS public.offer_performance_metrics;

CREATE MATERIALIZED VIEW public.offer_performance_metrics AS
SELECT
  o.id,
  o.title,
  o.created_at,
  COALESCE(e.views, 0)::int AS views,
  COALESCE(e.outbound, 0)::int AS outbound,
  COALESCE(e.shares, 0)::int AS shares,
  CASE
    WHEN COALESCE(e.views, 0) > 0 THEN ROUND((e.outbound::numeric / e.views) * 100, 2)
    ELSE NULL
  END AS ctr,
  COALESCE(v.score, 0)::int AS score,
  (COALESCE(v.score, 0)::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5))::numeric(10, 2) AS score_final
FROM public.offers o
LEFT JOIN (
  SELECT
    offer_id,
    COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
    COUNT(*) FILTER (WHERE event_type = 'outbound')::int AS outbound,
    COUNT(*) FILTER (WHERE event_type = 'share')::int AS shares
  FROM public.offer_events
  GROUP BY offer_id
) e ON e.offer_id = o.id
LEFT JOIN (
  SELECT
    offer_id,
    (COUNT(*) FILTER (WHERE value = 1) - COUNT(*) FILTER (WHERE value = -1))::int AS score
  FROM public.offer_votes
  GROUP BY offer_id
) v ON v.offer_id = o.id
WHERE o.status = 'approved';

CREATE UNIQUE INDEX ON public.offer_performance_metrics (id);
GRANT SELECT ON public.offer_performance_metrics TO anon, authenticated;
