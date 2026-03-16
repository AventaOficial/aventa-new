-- Corrige el error: "column ofertas_ranked_general.category does not exist"
-- Ejecutar en Supabase → SQL Editor (una sola vez).

-- 1) Añadir columna category a offers si no existe
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.offers.category IS 'Categoría: electronics, fashion, home, sports, books, other';

-- 2) Recrear la vista para que incluya category (y el resto de columnas actuales)
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
  o.category,
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
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum,
  COALESCE(o.reputation_weighted_score, 0)::numeric AS reputation_weighted_score,
  (COALESCE(o.ranking_momentum, 0) + COALESCE(o.reputation_weighted_score, 0)) AS ranking_blend
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
