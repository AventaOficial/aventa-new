-- Evitar duplicados en votos. Un voto positivo vale 2, uno negativo -1.
-- Ejecutar en Supabase SQL Editor.

-- 1) Una sola fila por (offer_id, user_id). Evita votos duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user
  ON public.offer_votes (offer_id, user_id);

-- 2) El trigger que rellena upvotes_count y downvotes_count debe contar así:
--    upvotes_count := (SELECT COUNT(*) FROM offer_votes WHERE offer_id = p_offer_id AND value IN (1, 2));
--    downvotes_count := (SELECT COUNT(*) FROM offer_votes WHERE offer_id = p_offer_id AND value = -1);
-- La API envía value = 2 para like (un voto vale 2) y value = -1 para dislike.
-- (Incluir value = 1 en upvotes si hay datos antiguos.)
