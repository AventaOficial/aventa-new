-- Complementa 20261009_personal_product_interests.sql.
-- No se ha ejecutado en bases remotas.
-- Cierra la carrera del límite de 30 y ata cada entrega de correo a una oferta existente.

CREATE OR REPLACE FUNCTION public.enforce_user_product_interest_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  IF (
    SELECT count(*)
    FROM public.user_product_interests
    WHERE user_id = NEW.user_id
  ) >= 30 THEN
    RAISE EXCEPTION 'interest_limit_reached' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_user_product_interest_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enforce_user_product_interest_limit() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'interest_mail_deliveries_offer_id_fkey'
      AND conrelid = 'public.interest_mail_deliveries'::regclass
  ) THEN
    ALTER TABLE public.interest_mail_deliveries
      ADD CONSTRAINT interest_mail_deliveries_offer_id_fkey
      FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
  END IF;
END $$;
