-- Meses sin intereses (MSI) y múltiples imágenes por oferta

-- MSI: cuántos meses y el monto por mes se calcula en la app (price / msi_months)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS msi_months INT NULL CHECK (msi_months IS NULL OR (msi_months >= 1 AND msi_months <= 24));

COMMENT ON COLUMN public.offers.msi_months IS 'Meses sin intereses (3, 6, 12, etc.). NULL si no aplica. El monto por mes = price / msi_months en la app.';

-- Múltiples imágenes: array de URLs (la primera puede coincidir con image_url para compatibilidad)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.offers.image_urls IS 'URLs de imágenes adicionales. image_url puede ser la primera para compatibilidad.';

-- Índice por si se filtra por MSI en el futuro
CREATE INDEX IF NOT EXISTS idx_offers_msi_months ON public.offers(msi_months) WHERE msi_months IS NOT NULL;

-- Incluir nuevas columnas en la vista del feed
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
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
