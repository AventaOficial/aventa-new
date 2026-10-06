-- Moneda de origen de una oferta.
-- NULL significa que el precio guardado no tiene moneda confirmada.
-- No rellena filas antiguas y no convierte importes.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS source_currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'offers_source_currency_iso'
      AND conrelid = 'public.offers'::regclass
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_source_currency_iso
      CHECK (source_currency IS NULL OR source_currency ~ '^[A-Z]{3}$');
  END IF;
END $$;
