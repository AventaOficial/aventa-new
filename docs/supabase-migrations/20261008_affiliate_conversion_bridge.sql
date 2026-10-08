-- Affiliate conversion bridge: historial de importación.
-- Aditivo. No liquida dinero, no abre payouts y no cambia política fiscal.
-- Las filas económicas siguen en affiliate_conversions / affiliate_commissions.

CREATE TABLE IF NOT EXISTS public.affiliate_import_batches (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('MERCADOLIBRE')),
  source_mode text NOT NULL CHECK (source_mode IN ('OFFICIAL_REPORT_IMPORT', 'API')),
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'partial', 'failed')),
  test_data boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(),
  provider_data_at timestamptz NULL,
  row_count integer NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  accepted integer NOT NULL DEFAULT 0 CHECK (accepted >= 0),
  rejected integer NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  duplicates integer NOT NULL DEFAULT 0 CHECK (duplicates >= 0),
  unmatched integer NOT NULL DEFAULT 0 CHECK (unmatched >= 0),
  confirmed integer NOT NULL DEFAULT 0 CHECK (confirmed >= 0),
  reversed integer NOT NULL DEFAULT 0 CHECK (reversed >= 0),
  error_code text NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_affiliate_import_batches_imported
  ON public.affiliate_import_batches (imported_at DESC);

COMMENT ON TABLE public.affiliate_import_batches IS
  'Auditoría de importación de evidencia de afiliados. No es un segundo ledger.';

ALTER TABLE public.affiliate_import_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliate_import_batches FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_import_batches FROM anon;
REVOKE ALL ON TABLE public.affiliate_import_batches FROM authenticated;
GRANT ALL ON TABLE public.affiliate_import_batches TO service_role;
