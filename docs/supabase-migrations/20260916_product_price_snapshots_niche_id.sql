-- Price Memory provenance: niche that originated the observation (Supply Engine context only).
-- Legacy rows remain NULL. No heuristic backfill.

ALTER TABLE public.product_price_snapshots
  ADD COLUMN IF NOT EXISTS niche_id text NULL;

COMMENT ON COLUMN public.product_price_snapshots.niche_id IS
  'Supply Engine niche provenance (beauty|electronics|day_to_day). NULL = unknown/legacy. Never inferred from title/category.';

ALTER TABLE public.product_price_snapshots
  DROP CONSTRAINT IF EXISTS product_price_snapshots_niche_id_check;

ALTER TABLE public.product_price_snapshots
  ADD CONSTRAINT product_price_snapshots_niche_id_check
  CHECK (
    niche_id IS NULL
    OR niche_id IN ('beauty', 'electronics', 'day_to_day')
  );

CREATE INDEX IF NOT EXISTS idx_product_price_snapshots_niche_lookup
  ON public.product_price_snapshots (marketplace, niche_id, recorded_on DESC)
  WHERE niche_id IS NOT NULL;
