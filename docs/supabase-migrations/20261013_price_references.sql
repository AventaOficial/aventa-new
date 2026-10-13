-- Referencias de precio publicadas por terceros (hoy: Profeco «Quién es Quién en los Precios»).
--
-- Tabla nueva, justificada: estos datos no son observaciones de Aventa. No tienen oferta, no
-- son en línea, llegan con ~2 meses de retraso, se publican por establecimiento físico y
-- Profeco puede revisarlos retroactivamente. Guardarlos en offer_price_snapshots mezclaría
-- evidencia propia con referencia externa (y su FK a offers no aplica). Price Memory
-- (product_price_snapshots) es solo Mercado Libre y mutable. price_intelligence_rollups no
-- existe en producción y modela conocimiento propio derivado.
--
-- Solo inserción: una revisión nueva del recurso produce llaves nuevas; nada se reescribe.
-- Sin lectura pública: solo service_role. Nada en la app la lee todavía.
--
-- Aplicar solo con autorización explícita. Verificación local: node scripts/verify-offer-price-observations-local.mjs

CREATE TABLE IF NOT EXISTS public.price_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  reference_key text NOT NULL,
  need_id text NOT NULL,
  variant_id text,
  presentation_key text NOT NULL,
  brand text,
  chain_key text NOT NULL,
  chain_label text NOT NULL,
  estado text NOT NULL,
  municipio text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'MXN',
  min_price numeric(12, 2) NOT NULL,
  median_price numeric(12, 2) NOT NULL,
  max_price numeric(12, 2) NOT NULL,
  observations integer NOT NULL,
  establishments integer NOT NULL,
  product_sample text NOT NULL,
  source_resource_url text NOT NULL,
  source_revision text NOT NULL,
  parser_version text NOT NULL,
  license text NOT NULL,
  idempotency_key text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT price_references_source_allowed CHECK (source IN ('profeco_qqp')),
  CONSTRAINT price_references_currency_mxn CHECK (currency = 'MXN'),
  CONSTRAINT price_references_prices_ordered CHECK (min_price > 0 AND min_price <= median_price AND median_price <= max_price),
  CONSTRAINT price_references_counts_positive CHECK (observations > 0 AND establishments > 0 AND establishments <= observations),
  CONSTRAINT price_references_period_ordered CHECK (period_start <= period_end),
  CONSTRAINT price_references_license_known CHECK (license IN ('CC-BY-4.0'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_price_references_idempotency_key
  ON public.price_references (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_price_references_lookup
  ON public.price_references (need_id, presentation_key, period_end DESC);

ALTER TABLE public.price_references ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.price_references FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.price_references TO service_role;

COMMENT ON TABLE public.price_references IS
  'Referencias de precio publicadas por terceros (Profeco QQP, CC BY 4.0). No son observaciones de Aventa '
  'ni ahorro verificado. Solo inserción; una revisión nueva del recurso es una fila nueva.';
