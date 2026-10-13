-- Observaciones de precio sobre offer_price_snapshots (motor de inteligencia de precios).
--
-- Aditiva y reversible sin pérdida: solo agrega columnas NULL o con DEFAULT, amplía el CHECK
-- de `source` con 'capture', y crea índices y guardas. No borra, no reescribe y no rellena filas.
-- Las filas existentes quedan con validation_status NULL («legado sin validar»): no cuentan
-- para ahorro verificado porque no prueban moneda, presentación ni alcance.
--
-- Decisión: ADR_price_memory_vs_observations / ADR_price_observation_read_bridge. No hay tabla
-- nueva `price_observations`; el backend ligado a ofertas sigue siendo offer_price_snapshots.
--
-- Aplicar solo con autorización explícita, primero en local (supabase start + psql) y luego
-- en el proyecto que corresponda. Procedimiento: docs/SYSTEMS/PRICE_INTELLIGENCE_ENGINE.md.

ALTER TABLE public.offer_price_snapshots
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS store_host text,
  ADD COLUMN IF NOT EXISTS source_id text,
  ADD COLUMN IF NOT EXISTS external_item_id text,
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS presentation_key text,
  ADD COLUMN IF NOT EXISTS need_id text,
  ADD COLUMN IF NOT EXISTS variant_id text,
  ADD COLUMN IF NOT EXISTS scope_kind text,
  ADD COLUMN IF NOT EXISTS scope_label text,
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS capture_method text,
  ADD COLUMN IF NOT EXISTS validation_status text,
  ADD COLUMN IF NOT EXISTS validation_reasons text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS corrects_snapshot_id uuid,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS capture_run_id text,
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.offer_price_snapshots.recorded_at IS
  'Momento de la observación. En filas source=capture es la hora exacta en que se leyó la fuente.';
COMMENT ON COLUMN public.offer_price_snapshots.original_price IS
  'Precio de lista mostrado por la fuente en el mismo momento. Es evidencia, nunca referencia de ahorro.';
COMMENT ON COLUMN public.offer_price_snapshots.identity_key IS
  'Producto canónico observado: fuente:item externo|necesidad|variante|presentación. NULL en filas legado.';
COMMENT ON COLUMN public.offer_price_snapshots.validation_status IS
  'valid | quarantined | invalid | superseded. NULL = legado sin validar. Solo valid cuenta para precios.';
COMMENT ON COLUMN public.offer_price_snapshots.corrects_snapshot_id IS
  'Fila que esta observación corrige o invalida. La fila corregida se conserva con validation_status superseded.';
COMMENT ON COLUMN public.offer_price_snapshots.idempotency_key IS
  'Una observación por oferta, item externo, alcance y ventana de 24 h. Reintentos y corridas simultáneas chocan aquí.';

DO $$
DECLARE
  c record;
BEGIN
  -- Amplía el CHECK de source sin depender del nombre generado por Postgres.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.offer_price_snapshots'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%(source = ANY%'
      AND conname NOT IN ('offer_price_snapshots_source_allowed', 'offer_price_snapshots_capture_complete')
  LOOP
    EXECUTE format('ALTER TABLE public.offer_price_snapshots DROP CONSTRAINT %I', c.conname);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_source_allowed'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_source_allowed
      CHECK (source = ANY (ARRAY['create', 'update', 'health', 'manual', 'app', 'capture']::text[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_validation_status_allowed'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_validation_status_allowed
      CHECK (validation_status IS NULL OR validation_status = ANY (ARRAY['valid', 'quarantined', 'invalid', 'superseded']::text[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_currency_iso'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_currency_iso
      CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_scope_kind_allowed'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_scope_kind_allowed
      CHECK (scope_kind IS NULL OR scope_kind = ANY (ARRAY['online', 'store', 'zone', 'unknown']::text[]));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_availability_allowed'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_availability_allowed
      CHECK (availability IS NULL OR availability = ANY (ARRAY['in_stock', 'limited', 'out_of_stock', 'unknown']::text[]));
  END IF;

  -- Una captura siempre declara cómo se validó y con qué llave de idempotencia.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_capture_complete'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_capture_complete
      CHECK (
        source <> 'capture'
        OR (validation_status IS NOT NULL AND idempotency_key IS NOT NULL AND policy_version IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'offer_price_snapshots_corrects_fk'
      AND conrelid = 'public.offer_price_snapshots'::regclass
  ) THEN
    ALTER TABLE public.offer_price_snapshots
      ADD CONSTRAINT offer_price_snapshots_corrects_fk
      FOREIGN KEY (corrects_snapshot_id) REFERENCES public.offer_price_snapshots(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Idempotencia en la base: dos reintentos o dos corridas simultáneas no duplican.
CREATE UNIQUE INDEX IF NOT EXISTS uq_offer_price_snapshots_idempotency_key
  ON public.offer_price_snapshots (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Selección de candidatos y lectura del historial capturado por oferta.
CREATE INDEX IF NOT EXISTS idx_offer_price_snapshots_capture_offer_recorded
  ON public.offer_price_snapshots (offer_id, recorded_at DESC)
  WHERE source = 'capture';

-- Cola de revisión: observaciones en cuarentena.
CREATE INDEX IF NOT EXISTS idx_offer_price_snapshots_quarantined
  ON public.offer_price_snapshots (recorded_at DESC)
  WHERE validation_status = 'quarantined';

-- Retención sin eliminación: una observación capturada no cambia su evidencia y no se borra
-- mientras su oferta exista. Solo el estado de validación puede avanzar (cuarentena → válida,
-- válida → reemplazada). El borrado en cascada de una oferta sigue funcionando.
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
    OR NEW.identity_key IS DISTINCT FROM OLD.identity_key
    OR NEW.presentation_key IS DISTINCT FROM OLD.presentation_key
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

DROP TRIGGER IF EXISTS trg_offer_price_snapshots_guard_capture ON public.offer_price_snapshots;
CREATE TRIGGER trg_offer_price_snapshots_guard_capture
  BEFORE UPDATE OR DELETE ON public.offer_price_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.offer_price_snapshots_guard_capture();

REVOKE ALL ON FUNCTION public.offer_price_snapshots_guard_capture() FROM PUBLIC, anon, authenticated;

-- Pausa/activación: sin fila = apagado. La activación es un INSERT explícito y autorizado
-- (ver documento). Esta migración no crea la fila.
COMMENT ON TABLE public.offer_price_snapshots IS
  'Historial propio de precios por oferta. Filas source=capture: observaciones del motor de precios '
  '(app_config.despensa_price_capture). Retención sin eliminación.';
