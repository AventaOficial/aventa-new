-- Cazadores de confianza (lista del owner): publican ofertas sin cola de moderación.
-- Independiente de reputation_level; el owner asigna desde /admin/owner.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS owner_auto_approve_offers boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS owner_auto_approve_offers_at timestamptz,
  ADD COLUMN IF NOT EXISTS owner_auto_approve_offers_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.owner_auto_approve_offers IS 'Si true, las ofertas del usuario se crean approved (salvo baneo/rate limit). Asignado por owner.';
COMMENT ON COLUMN public.profiles.owner_auto_approve_offers_at IS 'Cuándo se otorgó la exención de moderación.';
COMMENT ON COLUMN public.profiles.owner_auto_approve_offers_by IS 'UUID del owner que otorgó la exención.';

CREATE INDEX IF NOT EXISTS idx_profiles_owner_auto_approve_offers
  ON public.profiles (owner_auto_approve_offers)
  WHERE owner_auto_approve_offers = true;
