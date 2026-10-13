-- Versiona la vista materializada offer_performance_metrics, que existe en producción
-- sin migración en el repo (definición leída con pg_get_viewdef el 2026-10-13).
-- Usada por /admin/metrics y /api/admin/refresh-metrics (RPC refresh_offer_performance_metrics).
-- Idempotente; no toca filas.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.offer_performance_metrics AS
SELECT o.id,
    o.title,
    o.created_at,
    COALESCE(e.views, 0) AS views,
    COALESCE(e.outbound, 0) AS outbound,
    COALESCE(e.shares, 0) AS shares,
    CASE
        WHEN COALESCE(e.views, 0) > 0 THEN round(e.outbound::numeric / e.views::numeric * 100::numeric, 2)
        ELSE NULL::numeric
    END AS ctr,
    COALESCE(v.score, 0) AS score,
    (COALESCE(v.score, 0)::double precision / power(GREATEST(COALESCE(EXTRACT(epoch FROM now() - o.created_at), 0::numeric) / 3600::numeric + 2::numeric, 2::numeric), 1.5)::double precision)::numeric(10,2) AS score_final
FROM public.offers o
LEFT JOIN (
    SELECT offer_events.offer_id,
        count(*) FILTER (WHERE offer_events.event_type = 'view'::text)::integer AS views,
        count(*) FILTER (WHERE offer_events.event_type = 'outbound'::text)::integer AS outbound,
        count(*) FILTER (WHERE offer_events.event_type = 'share'::text)::integer AS shares
    FROM public.offer_events
    GROUP BY offer_events.offer_id
) e ON e.offer_id = o.id
LEFT JOIN (
    SELECT offer_votes.offer_id,
        (count(*) FILTER (WHERE offer_votes.value = 1) - count(*) FILTER (WHERE offer_votes.value = '-1'::integer))::integer AS score
    FROM public.offer_votes
    GROUP BY offer_votes.offer_id
) v ON v.offer_id = o.id
WHERE o.status = 'approved'::text;

CREATE UNIQUE INDEX IF NOT EXISTS offer_performance_metrics_id_idx
  ON public.offer_performance_metrics USING btree (id);

-- En producción anon/authenticated solo tienen MAINTAIN (sin SELECT); aquí no se les deja nada.
REVOKE ALL ON public.offer_performance_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.offer_performance_metrics TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_offer_performance_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW public.offer_performance_metrics;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_offer_performance_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_offer_performance_metrics() TO service_role;
