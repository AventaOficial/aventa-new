-- Ciclo de vida de las observaciones de precio y selección escalable de la captura.
--
-- Requiere 20261012_offer_price_observations.sql y 20261013_offer_price_observations_product_series.sql.
-- No crea tablas, no borra, no reescribe y no rellena filas. Idempotente.
--
-- 1. La evidencia sobrevive a su oferta de origen.
--    `offer_price_snapshots.offer_id` pasa a ON DELETE RESTRICT (el SQL base lo declaraba CASCADE).
--    Es la misma regla de offers_evidence_protection.sql (política de retención v2); si esa
--    migración ya está aplicada, este bloque no hace nada. Consecuencia: una oferta con
--    observaciones no se puede borrar físicamente (falla con 23503); se archiva
--    (status/deleted_at), como ya exige la política v2. El offer_id sigue siendo una
--    referencia válida: no hay huérfanos ni ids colgantes.
-- 2. Una observación capturada no se borra nunca (antes: solo mientras su oferta existiera).
-- 3. TRUNCATE de offer_price_snapshots queda bloqueado, también vía TRUNCATE offers CASCADE.
--    Las filas legado (source create/app/update) se pueden seguir borrando una a una: no son
--    capturas y no cambia su comportamiento.
-- 4. price_capture_product_stats: última observación y días válidos por producto, para que la
--    captura priorice sin recorrer la tabla. Solo service_role.
--
-- Break-glass (p. ej. una orden legal sobre una fila concreta): migración revisada que
-- deshabilita la guarda para esa operación y la vuelve a habilitar. Las observaciones no
-- contienen datos personales (precio, item, fuente, alcance «online/MX»).
--
-- Aplicar solo con autorización explícita, primero en local y luego en el proyecto que
-- corresponda. Verificación local: node scripts/verify-offer-price-observations-local.mjs

SET lock_timeout = '5s';

DO $$
DECLARE
  con record;
BEGIN
  IF to_regclass('public.offer_price_snapshots') IS NULL OR to_regclass('public.offers') IS NULL THEN
    RETURN;
  END IF;
  FOR con IN
    SELECT c.conname, c.confdeltype
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.offer_price_snapshots'::regclass
      AND c.confrelid = 'public.offers'::regclass
      AND array_length(c.conkey, 1) = 1
      AND a.attname = 'offer_id'
  LOOP
    IF con.confdeltype <> 'r' THEN
      EXECUTE format(
        'ALTER TABLE public.offer_price_snapshots DROP CONSTRAINT %I, ADD CONSTRAINT %I FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE RESTRICT NOT VALID',
        con.conname, con.conname
      );
      EXECUTE format('ALTER TABLE public.offer_price_snapshots VALIDATE CONSTRAINT %I', con.conname);
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.offer_price_snapshots_guard_capture()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source = 'capture' THEN
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

CREATE OR REPLACE FUNCTION public.offer_price_snapshots_forbid_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'offer_price_snapshots: TRUNCATE no está permitido (contiene observaciones capturadas)'
    USING ERRCODE = '42501',
          HINT = 'Política de retención v2. Requiere una migración break-glass revisada.';
END;
$$;

REVOKE ALL ON FUNCTION public.offer_price_snapshots_forbid_truncate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_offer_price_snapshots_no_truncate ON public.offer_price_snapshots;
CREATE TRIGGER trg_offer_price_snapshots_no_truncate
  BEFORE TRUNCATE ON public.offer_price_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION public.offer_price_snapshots_forbid_truncate();

REVOKE TRUNCATE ON public.offer_price_snapshots FROM PUBLIC, anon, authenticated;

-- Estado por producto para la selección de la captura. Usa
-- idx_offer_price_snapshots_capture_item_recorded (source_id, external_item_id, recorded_at).
-- Un «día válido» es un día UTC con al menos una observación válida y no agotada, igual que el motor.
CREATE OR REPLACE FUNCTION public.price_capture_product_stats(p_source_id text, p_item_ids text[], p_since timestamptz)
RETURNS TABLE (
  external_item_id text,
  last_recorded_at timestamptz,
  valid_days integer,
  first_valid_at timestamptz,
  last_valid_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT
    s.external_item_id,
    max(s.recorded_at),
    (count(DISTINCT (s.recorded_at AT TIME ZONE 'UTC')::date)
      FILTER (WHERE s.validation_status = 'valid' AND s.availability IS DISTINCT FROM 'out_of_stock'))::integer,
    min(s.recorded_at) FILTER (WHERE s.validation_status = 'valid' AND s.availability IS DISTINCT FROM 'out_of_stock'),
    max(s.recorded_at) FILTER (WHERE s.validation_status = 'valid' AND s.availability IS DISTINCT FROM 'out_of_stock')
  FROM public.offer_price_snapshots s
  WHERE s.source = 'capture'
    AND s.source_id = p_source_id
    AND s.external_item_id = ANY (p_item_ids)
    AND s.recorded_at >= p_since
  GROUP BY s.external_item_id
$$;

REVOKE ALL ON FUNCTION public.price_capture_product_stats(text, text[], timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_capture_product_stats(text, text[], timestamptz) TO service_role;
