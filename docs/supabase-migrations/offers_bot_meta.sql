-- Metadatos del bot de ingesta para la ficha de moderación.
-- Aditivo y nullable: las ofertas humanas y la lógica existente no cambian.
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS bot_meta jsonb;

COMMENT ON COLUMN public.offers.bot_meta IS
  'Señales del bot de ingesta (score desglosado, vendidos, rating, intel de precio, fuente). Solo lectura para moderación.';
