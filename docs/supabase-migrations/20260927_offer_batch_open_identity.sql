-- Identidad de adquisición entre lotes.
--
-- offer_batch_items solo tenía UNIQUE (batch_id, identity_key).
-- Dos requests concurrentes podían crear dos lotes con el mismo producto:
-- el SELECT previo no es atómico.
--
-- La identidad es identity_key (ASIN / item de Mercado Libre / host+path),
-- la misma que ya usa el lote. Vale solo mientras el ítem está en trabajo abierto.
-- PUBLISHED y REJECTED salen del índice, así que un rechazo o una publicación
-- permiten un reintento. No se agregan columnas ni una identidad nueva.
-- El pegado manual usa la misma clave y el mismo índice.

CREATE UNIQUE INDEX IF NOT EXISTS offer_batch_items_open_identity_uidx
  ON public.offer_batch_items (identity_key)
  WHERE status IN (
    'INGESTED',
    'PROCESSING',
    'READY',
    'NEEDS_REVIEW',
    'ERROR',
    'APPROVED'
  );
