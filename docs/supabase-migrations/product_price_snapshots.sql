-- Historial de precio por producto de marketplace (Price Engine ML).
-- Independiente de offers: el cazador guarda el precio aunque no publique.

CREATE TABLE IF NOT EXISTS public.product_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace text NOT NULL CHECK (marketplace = 'mercadolibre'),
  product_id text NOT NULL CHECK (char_length(product_id) BETWEEN 8 AND 32),
  last_price numeric(12, 2) NOT NULL CHECK (last_price >= 0),
  min_price numeric(12, 2) NOT NULL CHECK (min_price >= 0),
  list_price numeric(12, 2) NULL CHECK (list_price IS NULL OR list_price >= 0),
  regular_price numeric(12, 2) NULL CHECK (regular_price IS NULL OR regular_price >= 0),
  currency text NOT NULL DEFAULT 'MXN',
  recorded_on date NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_price_snapshots_min_lte_last CHECK (min_price <= last_price),
  CONSTRAINT product_price_snapshots_day_unique UNIQUE (marketplace, product_id, recorded_on)
);

CREATE INDEX IF NOT EXISTS idx_product_price_snapshots_lookup
  ON public.product_price_snapshots (marketplace, product_id, recorded_on DESC);

ALTER TABLE public.product_price_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_price_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_price_snapshots TO service_role;
