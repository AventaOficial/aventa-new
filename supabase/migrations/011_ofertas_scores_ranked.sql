-- Vista ofertas_scores_ranked: ofertas con score_final (decay por tiempo).
-- Fórmula: score / POWER(horas_desde_publicacion + 2, 1.5)
-- +2 evita división extrema en primeras horas; nuevas ofertas pueden subir rápido.
CREATE OR REPLACE VIEW public.ofertas_scores_ranked AS
SELECT
  *,
  (score::float / POWER(GREATEST(COALESCE(EXTRACT(EPOCH FROM (now() - created_at)), 0) / 3600 + 2, 2), 1.5)) AS score_final
FROM public.ofertas_scores;
