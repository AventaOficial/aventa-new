-- Añadir columna category a offers (valores: electronics, fashion, home, sports, books, other).
-- Ejecutar antes de actualizar la vista ofertas_ranked_general si esta incluye category.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN public.offers.category IS 'Categoría de la oferta: electronics, fashion, home, sports, books, other';
