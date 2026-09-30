-- Batch Ingestion v2 — lotes de ofertas para moderación operativa.
--
-- Un lote agrupa URLs pegadas por un operador. Cada ítem se procesa en servidor
-- (extracción compartida con /api/parse-offer-url), se valida, se deduplica y
-- queda en READY / NEEDS_REVIEW / ERROR. Aprobar un ítem crea la oferta `pending`
-- con el writer de comunidad existente (createCommunityOfferPending); publicar
-- sigue pasando por /api/admin/moderate-offer. Nunca escribe `approved` directo.
--
-- Escrituras: sólo service_role desde el servidor Next. Lectura: staff.
-- Apply via Supabase SQL editor / MCP en staging primero, luego production.

CREATE TABLE IF NOT EXISTS public.offer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'ready', 'completed', 'archived')),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz NULL,
  processing_completed_at timestamptz NULL,
  total_items integer NOT NULL DEFAULT 0,
  pending_items integer NOT NULL DEFAULT 0,
  ready_items integer NOT NULL DEFAULT 0,
  review_items integer NOT NULL DEFAULT 0,
  error_items integer NOT NULL DEFAULT 0,
  approved_items integer NOT NULL DEFAULT 0,
  published_items integer NOT NULL DEFAULT 0,
  rejected_items integer NOT NULL DEFAULT 0,
  duplicate_items integer NOT NULL DEFAULT 0,
  source_text_hash text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_offer_batches_created_at
  ON public.offer_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_batches_created_by
  ON public.offer_batches (created_by, created_at DESC);

CREATE TABLE IF NOT EXISTS public.offer_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.offer_batches(id) ON DELETE CASCADE,
  position integer NOT NULL,
  status text NOT NULL DEFAULT 'INGESTED'
    CHECK (status IN (
      'INGESTED', 'PROCESSING', 'READY', 'NEEDS_REVIEW', 'ERROR',
      'APPROVED', 'PUBLISHED', 'REJECTED'
    )),
  -- Identidad estable dentro del lote (ASIN / item ML / host+path). Dedupe intra-lote.
  identity_key text NOT NULL,
  source_url text NOT NULL,
  normalized_url text NULL,
  canonical_url text NULL,
  retailer text NULL,
  store text NULL,
  title text NULL,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric NULL,
  original_price numeric NULL,
  discount_percent numeric NULL,
  category text NULL,
  -- Pistas del texto pegado (título/precios del cazador). Nunca sustituyen evidencia.
  hint_title text NULL,
  hint_price numeric NULL,
  hint_original_price numeric NULL,
  hint_note text NULL,
  extraction_status text NULL
    CHECK (extraction_status IS NULL OR extraction_status IN ('success', 'partial', 'failed')),
  validation_status text NULL
    CHECK (validation_status IS NULL OR validation_status IN ('ok', 'invalid_url', 'blocked_host', 'missing_fields')),
  duplicate_status text NULL
    CHECK (duplicate_status IS NULL OR duplicate_status IN ('none', 'duplicate', 'in_batch')),
  duplicate_offer_id uuid NULL,
  quality_status text NULL,
  error_code text NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0,
  lease_expires_at timestamptz NULL,
  offer_id uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  rejection_reason text NULL,
  processed_at timestamptz NULL,
  approved_at timestamptz NULL,
  published_at timestamptz NULL,
  rejected_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT offer_batch_items_batch_identity_unique UNIQUE (batch_id, identity_key)
);

CREATE INDEX IF NOT EXISTS idx_offer_batch_items_batch_status
  ON public.offer_batch_items (batch_id, status, position);
CREATE INDEX IF NOT EXISTS idx_offer_batch_items_offer_id
  ON public.offer_batch_items (offer_id)
  WHERE offer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offer_batch_items_lease
  ON public.offer_batch_items (batch_id, lease_expires_at)
  WHERE status = 'PROCESSING';

-- Auditoría append-only. Cada acción administrativa (crear, procesar, editar,
-- cambiar URL, aprobar, rechazar, reprocesar, acciones masivas) deja fila.
CREATE TABLE IF NOT EXISTS public.offer_batch_item_events (
  id bigserial PRIMARY KEY,
  batch_id uuid NOT NULL REFERENCES public.offer_batches(id) ON DELETE CASCADE,
  item_id uuid NULL REFERENCES public.offer_batch_items(id) ON DELETE CASCADE,
  actor_id uuid NULL,
  action text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_batch_item_events_batch
  ON public.offer_batch_item_events (batch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_batch_item_events_item
  ON public.offer_batch_item_events (item_id, created_at DESC);

COMMENT ON TABLE public.offer_batches IS
  'Lotes de URLs pegadas por staff. Contadores se recalculan en servidor tras cada mutación.';
COMMENT ON TABLE public.offer_batch_items IS
  'Ítem de lote. APPROVED = oferta pending creada (offer_id). PUBLISHED se deriva de offers.status=approved.';
COMMENT ON TABLE public.offer_batch_item_events IS
  'Auditoría append-only de acciones sobre lotes/ítems. Nunca se actualiza ni borra.';

-- RLS fail-closed: clientes no escriben. Staff lee vía user JWT (opcional para futuros dashboards).
ALTER TABLE public.offer_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_batch_item_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.offer_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.offer_batch_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.offer_batch_item_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.offer_batches TO service_role;
GRANT ALL ON TABLE public.offer_batch_items TO service_role;
GRANT ALL ON TABLE public.offer_batch_item_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.offer_batch_item_events_id_seq TO service_role;

GRANT SELECT ON TABLE public.offer_batches TO authenticated;
GRANT SELECT ON TABLE public.offer_batch_items TO authenticated;
GRANT SELECT ON TABLE public.offer_batch_item_events TO authenticated;

DROP POLICY IF EXISTS offer_batches_select_staff ON public.offer_batches;
CREATE POLICY offer_batches_select_staff
  ON public.offer_batches FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS offer_batch_items_select_staff ON public.offer_batch_items;
CREATE POLICY offer_batch_items_select_staff
  ON public.offer_batch_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS offer_batch_item_events_select_staff ON public.offer_batch_item_events;
CREATE POLICY offer_batch_item_events_select_staff
  ON public.offer_batch_item_events FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated → fail-closed for clients.
