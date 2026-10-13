-- Versiona el índice que impide dos ítems de lote abiertos con la misma identidad de producto.
-- Existe en producción y staging (pg_indexes, 2026-10-13) pero ningún archivo del repo lo creaba:
-- una base reconstruida desde el repo perdía la deduplicación entre lotes de createOfferBatch.
-- Estados = OPEN_ACQUISITION_ITEM_STATUSES (lib/offers/batch/contract.ts). Idempotente.

CREATE UNIQUE INDEX IF NOT EXISTS offer_batch_items_open_identity_uidx
  ON public.offer_batch_items USING btree (identity_key)
  WHERE status IN ('INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR', 'APPROVED');
