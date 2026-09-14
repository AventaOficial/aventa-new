-- Índice de soporte para anti-recirculación post auto_rejected_timeout.
-- Solo lectura en runtime (findDuplicateOfferByUrl). NO modifica filas existentes.
-- NO aplica UNIQUE. NO cambiar thresholds ni lifecycle.
-- LOCAL/ops: crear el archivo; NO aplicar en producción desde este cambio.

CREATE INDEX IF NOT EXISTS idx_offers_fingerprint_timeout_cooldown
  ON public.offers (product_fingerprint, updated_at DESC)
  WHERE status = 'rejected'
    AND rejection_reason = 'auto_rejected_timeout'
    AND deleted_at IS NULL
    AND product_fingerprint IS NOT NULL
    AND product_fingerprint ~ '^(amz|ml):';

COMMENT ON INDEX public.idx_offers_fingerprint_timeout_cooldown IS
  'Acelera lookup de cooldown de recirculación hunter tras auto_rejected_timeout.';
