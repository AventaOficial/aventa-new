-- Comentario público opcional del cazador para el feed (Offer Card).
-- No reemplaza description (detalle completo). Nullable / additive / backward-compatible.
-- Ejecutar en Supabase SQL Editor (staging primero; producción solo tras validación).

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS hunter_comment text;

COMMENT ON COLUMN public.offers.hunter_comment IS
  'Comentario corto público del cazador para la Offer Card; opcional; no sustituye description';

-- Recrear vista del feed con hunter_comment (lista explícita; base = categories_unification + ranking_blend).
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
  o.bank_coupon,
  o.tags,
  o.store,
  o.category,
  o.offer_url,
  o.description,
  o.hunter_comment,
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
  ((COALESCE(o.upvotes_count, 0) * 2 - COALESCE(o.downvotes_count, 0))::float /
    POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - o.created_at)), 0) / 3600 + 2, 2), 1.5)
  ) AS score_final,
  COALESCE(o.ranking_momentum, 0) AS ranking_momentum,
  COALESCE(o.reputation_weighted_score, 0)::numeric AS reputation_weighted_score,
  (COALESCE(o.ranking_momentum, 0) + COALESCE(o.reputation_weighted_score, 0)) AS ranking_blend
FROM public.offers o;

GRANT SELECT ON public.ofertas_ranked_general TO anon, authenticated;
