-- Vista ofertas_scores: offers con score precalculado desde offer_votes.
-- Permite consultar ofertas con puntuación sin depender de offer_vote_totals.
CREATE OR REPLACE VIEW public.ofertas_scores AS
SELECT
  o.id,
  o.title,
  o.price,
  o.original_price,
  o.image_url,
  o.store,
  o.offer_url,
  o.description,
  o.created_at,
  o.created_by,
  o.status,
  o.expires_at,
  COALESCE(v.up_votes, 0)::int AS up_votes,
  COALESCE(v.down_votes, 0)::int AS down_votes,
  COALESCE(v.score, 0)::int AS score
FROM public.offers o
LEFT JOIN (
  SELECT
    offer_id,
    COUNT(*) FILTER (WHERE value = 1)::int AS up_votes,
    COUNT(*) FILTER (WHERE value = -1)::int AS down_votes,
    (COUNT(*) FILTER (WHERE value = 1) - COUNT(*) FILTER (WHERE value = -1))::int AS score
  FROM public.offer_votes
  GROUP BY offer_id
) v ON v.offer_id = o.id;
