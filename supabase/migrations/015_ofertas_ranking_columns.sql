-- =============================================================================
-- Migración 015: Columnas físicas de ranking en offers (ofertas)
-- Objetivo: Mover ranking_momentum de cálculo dinámico en vistas a columna física
-- para escalabilidad y reactividad en tiempo real.
--
-- Seguro para producción: ADD COLUMN con DEFAULT, sin bloqueo prolongado.
-- Sin pérdida de datos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Añadir columnas a public.offers
-- -----------------------------------------------------------------------------
-- Usar IF NOT EXISTS para idempotencia (re-ejecución segura)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'votes_count'
  ) THEN
    ALTER TABLE public.offers
      ADD COLUMN votes_count integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'outbound_24h'
  ) THEN
    ALTER TABLE public.offers
      ADD COLUMN outbound_24h integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'ctr_24h'
  ) THEN
    ALTER TABLE public.offers
      ADD COLUMN ctr_24h numeric NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'offers' AND column_name = 'ranking_momentum'
  ) THEN
    ALTER TABLE public.offers
      ADD COLUMN ranking_momentum numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2) Backfill inicial (población de datos existentes)
-- -----------------------------------------------------------------------------
-- Usa la misma fórmula que ofertas_scores_ranked: score / POWER(horas_desde_publicacion + 2, 1.5)

UPDATE public.offers o
SET
  votes_count = COALESCE(v.cnt, 0),
  ranking_momentum = (
    COALESCE(v.score, 0)::float
    / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)
  )::numeric
FROM (
  SELECT
    offer_id,
    COUNT(*)::int AS cnt,
    (COUNT(*) FILTER (WHERE value = 1) - COUNT(*) FILTER (WHERE value = -1))::int AS score
  FROM public.offer_votes
  GROUP BY offer_id
) v
WHERE v.offer_id = o.id
  AND (o.votes_count = 0 OR o.ranking_momentum = 0);

-- Backfill outbound_24h y ctr_24h desde offer_events (últimas 24h)
UPDATE public.offers o
SET
  outbound_24h = COALESCE(e.outbound, 0),
  ctr_24h = CASE
    WHEN COALESCE(e.views, 0) > 0 THEN ROUND((e.outbound::numeric / e.views) * 100, 2)
    ELSE 0
  END
FROM (
  SELECT
    offer_id,
    COUNT(*) FILTER (WHERE event_type = 'view')::int AS views,
    COUNT(*) FILTER (WHERE event_type = 'outbound')::int AS outbound
  FROM public.offer_events
  WHERE created_at >= now() - interval '24 hours'
  GROUP BY offer_id
) e
WHERE e.offer_id = o.id;

-- Ofertas sin votos ni eventos: ranking_momentum ya es 0 por DEFAULT, no requiere UPDATE

-- -----------------------------------------------------------------------------
-- 3) Índices para consultas de ranking y filtrado
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_offers_ranking_momentum_desc
  ON public.offers (ranking_momentum DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_offers_status
  ON public.offers (status);

CREATE INDEX IF NOT EXISTS idx_offers_expires_at
  ON public.offers (expires_at);

-- Índice compuesto para la query típica: status approved + expires_at + ranking
CREATE INDEX IF NOT EXISTS idx_offers_status_expires_ranking
  ON public.offers (status, expires_at)
  WHERE status = 'approved';

-- -----------------------------------------------------------------------------
-- 4) Vista ofertas_ranked_general (compatibilidad con app)
-- -----------------------------------------------------------------------------
-- La app usa .from('ofertas_ranked_general').order('ranking_momentum', { ascending: false })
-- Esta vista lee ranking_momentum desde la columna física y mantiene score_final para modo 'top'.

CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
SELECT
  s.id,
  s.title,
  s.price,
  s.original_price,
  s.image_url,
  s.store,
  s.offer_url,
  s.description,
  s.created_at,
  s.created_by,
  s.status,
  s.expires_at,
  s.up_votes,
  s.down_votes,
  s.score,
  s.score::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - s.created_at)), 0) / 3600 + 2, 2), 1.5) AS score_final,
  COALESCE(o.ranking_momentum, s.score::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - s.created_at)), 0) / 3600 + 2, 2), 1.5)) AS ranking_momentum
FROM public.ofertas_scores s
JOIN public.offers o ON o.id = s.id;

-- Permisos: mismo que ofertas_scores
GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- NOTA: Para reactividad en tiempo real, crear triggers o jobs que actualicen
-- votes_count, ranking_momentum, outbound_24h y ctr_24h cuando cambien
-- offer_votes u offer_events. Esta migración solo añade columnas e índices.
-- -----------------------------------------------------------------------------
