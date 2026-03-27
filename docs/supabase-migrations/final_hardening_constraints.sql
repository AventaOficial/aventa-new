-- Fase final de blindaje: constraints duros no invasivos.
-- Ejecutar en Supabase SQL Editor.
-- Nota: usamos NOT VALID para no bloquear datos legacy ya existentes.
-- Estas reglas SI aplican para nuevos inserts/updates desde que se crean.

BEGIN;

-- 1) Normalizar votos legacy (value=1) al estándar actual (value=2).
UPDATE public.offer_votes
SET value = 2
WHERE value = 1;

-- 2) Constraint estricto de votos permitidos.
ALTER TABLE public.offer_votes
  DROP CONSTRAINT IF EXISTS offer_votes_value_check;

ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[-1, 2])) NOT VALID;

-- 3) Integridad mínima de ofertas.
ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_price_non_negative_check,
  DROP CONSTRAINT IF EXISTS offers_original_price_non_negative_check,
  DROP CONSTRAINT IF EXISTS offers_title_not_empty_check,
  DROP CONSTRAINT IF EXISTS offers_store_not_empty_check,
  DROP CONSTRAINT IF EXISTS offers_msi_months_range_check,
  DROP CONSTRAINT IF EXISTS offers_bank_coupon_valid_check;

ALTER TABLE public.offers
  ADD CONSTRAINT offers_price_non_negative_check
  CHECK (price >= 0) NOT VALID,
  ADD CONSTRAINT offers_original_price_non_negative_check
  CHECK (original_price IS NULL OR original_price >= 0) NOT VALID,
  ADD CONSTRAINT offers_title_not_empty_check
  CHECK (title IS NULL OR btrim(title) <> '') NOT VALID,
  ADD CONSTRAINT offers_store_not_empty_check
  CHECK (store IS NULL OR btrim(store) <> '') NOT VALID,
  ADD CONSTRAINT offers_msi_months_range_check
  CHECK (msi_months IS NULL OR (msi_months >= 1 AND msi_months <= 24)) NOT VALID,
  ADD CONSTRAINT offers_bank_coupon_valid_check
  CHECK (
    bank_coupon IS NULL
    OR bank_coupon = ''
    OR bank_coupon = ANY (ARRAY['bbva','banamex','santander','hsbc','banorte','scotiabank','inbursa','nu','rappi-card','otro'])
  ) NOT VALID;

-- 4) Evitar votos duplicados por usuario en una misma oferta.
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user
  ON public.offer_votes (offer_id, user_id);

COMMIT;

-- Opcional post-migración (cuando la base ya esté limpia):
-- ALTER TABLE public.offer_votes VALIDATE CONSTRAINT offer_votes_value_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_price_non_negative_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_original_price_non_negative_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_title_not_empty_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_store_not_empty_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_msi_months_range_check;
-- ALTER TABLE public.offers VALIDATE CONSTRAINT offers_bank_coupon_valid_check;
