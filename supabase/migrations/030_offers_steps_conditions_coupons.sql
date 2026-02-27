-- Información adicional de ofertas: pasos, condiciones, cupones

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS steps text,
  ADD COLUMN IF NOT EXISTS conditions text,
  ADD COLUMN IF NOT EXISTS coupons text;

COMMENT ON COLUMN public.offers.steps IS 'Pasos para obtener la oferta (ej. agregar al carrito, aplicar cupón)';
COMMENT ON COLUMN public.offers.conditions IS 'Condiciones de la oferta (ej. válido hasta fecha, solo en línea)';
COMMENT ON COLUMN public.offers.coupons IS 'Cupones o códigos de descuento';

-- Recrear vista (DROP evita conflicto de columnas con CREATE OR REPLACE)
DROP VIEW IF EXISTS public.ofertas_ranked_general;

CREATE VIEW public.ofertas_ranked_general AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
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
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
