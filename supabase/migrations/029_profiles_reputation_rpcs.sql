-- Reputación: contadores de ofertas por usuario y RPCs para incrementarlos

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS offers_submitted_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offers_approved_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS offers_rejected_count int NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.offers_submitted_count IS 'Ofertas enviadas por el usuario';
COMMENT ON COLUMN public.profiles.offers_approved_count IS 'Ofertas aprobadas del usuario';
COMMENT ON COLUMN public.profiles.offers_rejected_count IS 'Ofertas rechazadas del usuario';

CREATE OR REPLACE FUNCTION public.increment_offers_submitted_count(uuid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET offers_submitted_count = offers_submitted_count + 1 WHERE id = uuid;
$$;

CREATE OR REPLACE FUNCTION public.increment_offers_approved_count(uuid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET offers_approved_count = offers_approved_count + 1 WHERE id = uuid;
$$;

CREATE OR REPLACE FUNCTION public.increment_offers_rejected_count(uuid uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET offers_rejected_count = offers_rejected_count + 1 WHERE id = uuid;
$$;
