-- Añadir created_at a offer_votes si no existe (para métricas diarias)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'offer_votes')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'offer_votes' AND column_name = 'created_at')
  THEN
    ALTER TABLE public.offer_votes ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Vista de métricas diarias del sistema
CREATE OR REPLACE VIEW public.daily_system_metrics AS
WITH dates AS (
  SELECT generate_series(
    (CURRENT_DATE - INTERVAL '90 days')::date,
    CURRENT_DATE,
    '1 day'::interval
  )::date AS date
),
offers_by_date AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS date, COUNT(*) AS cnt
  FROM public.offers
  GROUP BY (created_at AT TIME ZONE 'UTC')::date
),
votes_by_date AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS date, COUNT(*) AS cnt
  FROM public.offer_votes
  GROUP BY (created_at AT TIME ZONE 'UTC')::date
),
events_by_date AS (
  SELECT (created_at AT TIME ZONE 'UTC')::date AS date,
    COUNT(*) FILTER (WHERE event_type = 'view') AS views,
    COUNT(*) FILTER (WHERE event_type = 'outbound') AS outbound
  FROM public.offer_events
  GROUP BY (created_at AT TIME ZONE 'UTC')::date
)
SELECT
  d.date,
  COALESCE(o.cnt, 0)::int AS total_offers_created,
  COALESCE(v.cnt, 0)::int AS total_votes,
  COALESCE(e.views, 0)::int AS total_views,
  COALESCE(e.outbound, 0)::int AS total_outbound,
  CASE
    WHEN COALESCE(e.views, 0) > 0 THEN ROUND((e.outbound::numeric / e.views) * 100, 2)
    ELSE NULL
  END AS ctr
FROM dates d
LEFT JOIN offers_by_date o ON o.date = d.date
LEFT JOIN votes_by_date v ON v.date = d.date
LEFT JOIN events_by_date e ON e.date = d.date;
