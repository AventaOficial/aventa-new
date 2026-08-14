-- Evolución del programa de comisiones: atribución por creador/tag sin tirar pools legacy.
-- Política: docs/POLITICA_COMISIONES_CREADORES.md
-- Ejecutar en Supabase SQL Editor después de affiliate_platform_ledger.sql y commissions_pools_allocations.sql.

-- ── Ledger: quién generó la comisión ──────────────────────────────────────────
ALTER TABLE public.affiliate_ledger_entries
  ADD COLUMN IF NOT EXISTS creator_id uuid NULL,
  ADD COLUMN IF NOT EXISTS tracking_tag text NULL,
  ADD COLUMN IF NOT EXISTS offer_id uuid NULL,
  ADD COLUMN IF NOT EXISTS attributable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.affiliate_ledger_entries.creator_id IS
  'Creador al que se atribuye esta comisión (si aplica).';
COMMENT ON COLUMN public.affiliate_ledger_entries.tracking_tag IS
  'Tag de red (ej. ml_tracking_tag) usado para conciliar el reporte.';
COMMENT ON COLUMN public.affiliate_ledger_entries.offer_id IS
  'Oferta opcional si el reporte permite granularidad.';
COMMENT ON COLUMN public.affiliate_ledger_entries.attributable IS
  'true = entra al cálculo de pago a creadores; false = se queda en plataforma.';

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_creator_created
  ON public.affiliate_ledger_entries (creator_id, created_at DESC)
  WHERE creator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_tag_created
  ON public.affiliate_ledger_entries (tracking_tag, created_at DESC)
  WHERE tracking_tag IS NOT NULL AND btrim(tracking_tag) <> '';

-- Si ya hay creator_id, marcar attributable (idempotente para filas nuevas se hace en app).
UPDATE public.affiliate_ledger_entries
SET attributable = true
WHERE creator_id IS NOT NULL AND attributable = false;

-- ── Pools: regla de reparto + totales atribuibles ─────────────────────────────
ALTER TABLE public.commission_pools
  ADD COLUMN IF NOT EXISTS allocation_rule text NOT NULL DEFAULT 'points_per_qualifying_offer',
  ADD COLUMN IF NOT EXISTS attributable_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unattributable_cents bigint NOT NULL DEFAULT 0;

-- Constraint suave: solo valores conocidos (drop/recreate si ya existiera con otro nombre).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'commission_pools_allocation_rule_check'
  ) THEN
    ALTER TABLE public.commission_pools
      ADD CONSTRAINT commission_pools_allocation_rule_check
      CHECK (allocation_rule IN ('attributed_revenue', 'points_per_qualifying_offer'));
  END IF;
END $$;

COMMENT ON COLUMN public.commission_pools.allocation_rule IS
  'attributed_revenue = % de comisión atribuida; points_per_qualifying_offer = legacy por votos.';
COMMENT ON COLUMN public.commission_pools.attributable_cents IS
  'Suma de ledger atribuible del periodo (base del share a creadores).';
COMMENT ON COLUMN public.commission_pools.unattributable_cents IS
  'Suma de ledger sin creador/tag (100% plataforma).';

-- Pools ya existentes quedan en legacy (default de la columna).
