-- Serie de precios por producto (seguimiento del motor de inteligencia de precios).
--
-- Requiere 20261012_offer_price_observations.sql. Aditiva: un índice y una versión más estricta
-- de la guarda. No crea tablas, no borra, no reescribe y no rellena filas.
--
-- Contexto: una oferta dura ~7 días y el criterio de ahorro verificado pide ≥14 días de
-- historial. Por eso la serie se lee por producto (source_id + external_item_id) a través de
-- todas las ofertas que lo publicaron, no por offer_id. Decisión y alcance:
-- docs/SYSTEMS/PRICE_INTELLIGENCE_ENGINE.md («Identidad y continuidad»).
--
-- Aplicar solo con autorización explícita, primero en local y luego en el proyecto que
-- corresponda. Verificación local: node scripts/verify-offer-price-observations-local.mjs

-- Lectura del historial del producto y comprobación de capturas recientes por item externo.
CREATE INDEX IF NOT EXISTS idx_offer_price_snapshots_capture_item_recorded
  ON public.offer_price_snapshots (source_id, external_item_id, recorded_at DESC)
  WHERE source = 'capture';

-- La guarda ahora también protege la identidad del producto: si source_id, external_item_id,
-- need_id o variant_id cambiaran, una observación podría saltar a la serie de otro producto.
CREATE OR REPLACE FUNCTION public.offer_price_snapshots_guard_capture()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'capture' AND EXISTS (SELECT 1 FROM public.offers o WHERE o.id = OLD.offer_id) THEN
      RAISE EXCEPTION 'offer_price_snapshots: las observaciones capturadas no se eliminan (id %)', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.source = 'capture' AND (
    NEW.offer_id IS DISTINCT FROM OLD.offer_id
    OR NEW.price IS DISTINCT FROM OLD.price
    OR NEW.original_price IS DISTINCT FROM OLD.original_price
    OR NEW.recorded_at IS DISTINCT FROM OLD.recorded_at
    OR NEW.source IS DISTINCT FROM OLD.source
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.external_item_id IS DISTINCT FROM OLD.external_item_id
    OR NEW.identity_key IS DISTINCT FROM OLD.identity_key
    OR NEW.presentation_key IS DISTINCT FROM OLD.presentation_key
    OR NEW.need_id IS DISTINCT FROM OLD.need_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
    OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
    OR NEW.scope_label IS DISTINCT FROM OLD.scope_label
    OR NEW.availability IS DISTINCT FROM OLD.availability
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.provenance IS DISTINCT FROM OLD.provenance
  ) THEN
    RAISE EXCEPTION 'offer_price_snapshots: la evidencia de una observación capturada es inmutable (id %)', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.offer_price_snapshots_guard_capture() FROM PUBLIC, anon, authenticated;
