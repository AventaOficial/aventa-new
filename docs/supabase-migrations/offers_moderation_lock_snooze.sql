-- Colaboración en cola de moderación: lock + snooze
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

COMMENT ON COLUMN public.offers.locked_by IS 'Moderador que tiene la oferta abierta en revisión.';
COMMENT ON COLUMN public.offers.locked_at IS 'Último heartbeat del lock de moderación.';
COMMENT ON COLUMN public.offers.snoozed_until IS 'Ocultar al fondo de la cola hasta esta fecha (snooze).';

CREATE INDEX IF NOT EXISTS idx_offers_pending_snooze
  ON public.offers (status, snoozed_until NULLS FIRST, created_at)
  WHERE status = 'pending';
