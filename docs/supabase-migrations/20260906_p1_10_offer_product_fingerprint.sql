-- P1-10 — product_fingerprint + UNIQUE parcial anti-TOCTOU
-- LOCAL ONLY. NO aplicar en Production desde esta fase.
--
-- Production READ-ONLY (2026-09-06):
--   activeish offers ≈ 37
--   exact URL dup groups = 0
--   fingerprint (amz/ml) dup groups = 0
-- → constraint viable sin cleanup previo.
--
-- Semántica de "duplicate" (alineada con findDuplicateOffer):
--   mismo amz:ASIN o ml:ITEM entre offers pending|approved|published y deleted_at IS NULL.
--   rejected / soft-deleted / URLs débiles (url:*) NO entran en el índice.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS product_fingerprint text NULL;

COMMENT ON COLUMN public.offers.product_fingerprint IS
  'Huella fuerte de producto (amz:ASIN | ml:ITEM). NULL si URL débil o no parseable.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active_product_fingerprint
  ON public.offers (product_fingerprint)
  WHERE product_fingerprint IS NOT NULL
    AND product_fingerprint ~ '^(amz|ml):'
    AND deleted_at IS NULL
    AND status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text]);

-- Backfill local opcional (no Production en esta fase):
-- UPDATE public.offers o SET product_fingerprint = ... WHERE ...;
