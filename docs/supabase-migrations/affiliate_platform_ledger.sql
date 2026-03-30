-- Libro mayor interno: ingresos de afiliado reportados por red (manual / futuro CSV / API).
-- La app aplica ?tag= y parámetros en enlaces; esto es la fuente de verdad contable al importar reportes de cada red.
-- Solo accesible vía service_role (API admin); sin políticas RLS = sin lectura pública por PostgREST.

CREATE TABLE IF NOT EXISTS public.affiliate_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  amount_cents bigint NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  period_start date NULL,
  period_end date NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accrued', 'paid', 'void')),
  external_ref text NULL,
  notes text NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'api')),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_ledger_network_created
  ON public.affiliate_ledger_entries (network, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS affiliate_ledger_unique_external_per_network
  ON public.affiliate_ledger_entries (network, external_ref)
  WHERE external_ref IS NOT NULL AND btrim(external_ref) <> '';

ALTER TABLE public.affiliate_ledger_entries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.affiliate_ledger_entries IS
  'Comisiones de afiliado de plataforma (AVENTA): import manual o futura automatización; no confundir con reparto a creadores.';
