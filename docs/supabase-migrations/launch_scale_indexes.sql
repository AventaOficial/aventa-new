-- Índices orientados a ~10k+ usuarios activos: feed (ofertas aprobadas), moderación y votos.
-- Ejecutar en Supabase SQL Editor tras revisar EXPLAIN en consultas reales.
-- Si un índice ya existe con otro nombre, omitir o renombrar según tu esquema.

-- Feed: filtros habituales status + created_at (recientes) y status + expires (vigentes)
CREATE INDEX IF NOT EXISTS idx_offers_status_created_at
  ON public.offers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offers_status_expires_at
  ON public.offers (status, expires_at)
  WHERE expires_at IS NOT NULL;

-- Votos: evitar seq scan al contar / agregar por oferta y usuario
CREATE INDEX IF NOT EXISTS idx_offer_votes_offer_id
  ON public.offer_votes (offer_id);

CREATE INDEX IF NOT EXISTS idx_offer_votes_user_offer
  ON public.offer_votes (user_id, offer_id);

-- Moderación: cola pendiente
CREATE INDEX IF NOT EXISTS idx_offers_status_created_pending
  ON public.offers (created_at ASC)
  WHERE status = 'pending';

ANALYZE public.offers;
ANALYZE public.offer_votes;
