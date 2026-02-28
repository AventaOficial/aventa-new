-- Soft delete en ofertas: no borrar filas, marcar deleted_at.
-- RLS y vistas deben ignorar filas con deleted_at IS NOT NULL.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.offers.deleted_at IS 'Si no es NULL, la oferta está soft-deleted y no debe mostrarse.';

-- Índice para filtrar rápido en listados
CREATE INDEX IF NOT EXISTS idx_offers_deleted_at ON public.offers (deleted_at) WHERE deleted_at IS NOT NULL;

-- Actualizar políticas RLS para excluir ofertas borradas
-- (Las políticas actuales no mencionan deleted_at; las recreamos incluyendo la condición.)

DROP POLICY IF EXISTS offers_select_anon ON public.offers;
DROP POLICY IF EXISTS offers_select_authenticated ON public.offers;

CREATE POLICY offers_select_anon ON public.offers
  FOR SELECT TO anon
  USING (
    deleted_at IS NULL
    AND status IN ('approved', 'published')
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY offers_select_authenticated ON public.offers
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      (status IN ('approved', 'published') AND (expires_at IS NULL OR expires_at > now()))
      OR (created_by = auth.uid())
      OR (EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'moderator', 'owner')
      ))
    )
  );

-- Vista del feed: excluir ofertas soft-deleted
DROP VIEW IF EXISTS public.ofertas_ranked_general;

CREATE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.image_urls,
  o.msi_months,
  o.store,
  o.offer_url,
  o.description,
  o.steps,
  o.conditions,
  o.coupons,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(o.upvotes_count, 0)::int AS up_votes,
  COALESCE(o.downvotes_count, 0)::int AS down_votes,
  (COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::int AS score,
  ((COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum
FROM public.offers o
WHERE o.deleted_at IS NULL;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
