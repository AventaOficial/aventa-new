-- =============================================================================
-- CazaOfertasss FASE 3 — Affiliate Revenue Ingestion & Attribution
-- STAGING ONLY. Tablas caza_* exclusivamente.
-- No toca creator_rewards / payout_intents / reward_payouts / commissions /
-- affiliate_ledger_entries / settlement.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Extender caza_revenue_events (FASE 1) — columnas FASE 3 + CANCELLATION
-- ---------------------------------------------------------------------------

ALTER TABLE public.caza_revenue_events
  DROP CONSTRAINT IF EXISTS caza_revenue_events_event_type_check;

ALTER TABLE public.caza_revenue_events
  ADD CONSTRAINT caza_revenue_events_event_type_check
  CHECK (event_type IN (
    'CLICK', 'ORDER', 'APPROVED_ORDER', 'COMMISSION', 'REVERSAL', 'CANCELLATION'
  ));

ALTER TABLE public.caza_revenue_events
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12, 2) NULL
    CHECK (gross_amount IS NULL OR gross_amount > 0);

ALTER TABLE public.caza_revenue_events
  ADD COLUMN IF NOT EXISTS source_batch_id text NULL;

ALTER TABLE public.caza_revenue_events
  ADD COLUMN IF NOT EXISTS product_external_id text NULL;

ALTER TABLE public.caza_revenue_events
  ADD COLUMN IF NOT EXISTS product_reference text NULL;

COMMENT ON COLUMN public.caza_revenue_events.gross_amount IS
  'FASE 3 — monto bruto reportado (opcional). amount = comisión/hecho monetario.';

-- Recreate append RPC con columnas FASE 3 (sigue append-only / ON CONFLICT DO NOTHING).
CREATE OR REPLACE FUNCTION public.caza_append_revenue_event(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_revenue_events%ROWTYPE;
  v_appended boolean := false;
BEGIN
  IF p_row IS NULL OR p_row->>'event_id' IS NULL THEN
    RAISE EXCEPTION 'caza_append_revenue_event: event_id required';
  END IF;

  INSERT INTO public.caza_revenue_events AS t (
    event_id, network, external_reference, deal_id, tracking_label,
    event_type, amount, currency, occurred_at, status, reverses_event_id, recorded_at,
    gross_amount, source_batch_id, product_external_id, product_reference
  )
  VALUES (
    p_row->>'event_id',
    p_row->>'network',
    p_row->>'external_reference',
    NULLIF(p_row->>'deal_id', ''),
    p_row->>'tracking_label',
    p_row->>'event_type',
    NULLIF(p_row->>'amount', '')::numeric,
    NULLIF(p_row->>'currency', ''),
    (p_row->>'occurred_at')::timestamptz,
    p_row->>'status',
    NULLIF(p_row->>'reverses_event_id', ''),
    COALESCE((p_row->>'recorded_at')::timestamptz, now()),
    NULLIF(p_row->>'gross_amount', '')::numeric,
    NULLIF(p_row->>'source_batch_id', ''),
    NULLIF(p_row->>'product_external_id', ''),
    NULLIF(p_row->>'product_reference', '')
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_appended := true;
  ELSE
    SELECT * INTO v_row
    FROM public.caza_revenue_events
    WHERE event_id = p_row->>'event_id';
  END IF;

  RETURN jsonb_build_object(
    'appended', v_appended,
    'duplicate', NOT v_appended,
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caza_append_revenue_event(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_append_revenue_event(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) caza_revenue_import_batches — metadata de lote (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_revenue_import_batches (
  batch_id text PRIMARY KEY,
  provider text NOT NULL
    CHECK (provider IN ('mercadolibre_affiliates', 'amazon_associates_mx')),
  received_at timestamptz NOT NULL,
  record_count integer NOT NULL CHECK (record_count >= 0),
  source_label text NOT NULL,
  opaque_payload_present boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caza_revenue_import_batches IS
  'CazaOfertasss FASE 3 — import batch metadata. APPEND-ONLY. Not Aventa money path.';

CREATE OR REPLACE FUNCTION public.caza_revenue_batches_forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'caza_revenue_import_batches is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_caza_revenue_batches_no_update ON public.caza_revenue_import_batches;
CREATE TRIGGER trg_caza_revenue_batches_no_update
  BEFORE UPDATE ON public.caza_revenue_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_batches_forbid_mutation();

DROP TRIGGER IF EXISTS trg_caza_revenue_batches_no_delete ON public.caza_revenue_import_batches;
CREATE TRIGGER trg_caza_revenue_batches_no_delete
  BEFORE DELETE ON public.caza_revenue_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_batches_forbid_mutation();

-- ---------------------------------------------------------------------------
-- 3) caza_revenue_raw_records — raw opaco / proyectado (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_revenue_raw_records (
  raw_id text PRIMARY KEY,
  batch_id text NOT NULL REFERENCES public.caza_revenue_import_batches (batch_id),
  provider text NOT NULL
    CHECK (provider IN ('mercadolibre_affiliates', 'amazon_associates_mx')),
  external_reference text NOT NULL,
  event_type text NOT NULL,
  payload_json jsonb NOT NULL,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caza_revenue_raw_records_batch_ref_type_uidx
    UNIQUE (batch_id, provider, external_reference, event_type)
);

COMMENT ON TABLE public.caza_revenue_raw_records IS
  'CazaOfertasss FASE 3 — raw revenue records as ingested. APPEND-ONLY. Opaque payload_json.';

CREATE INDEX IF NOT EXISTS caza_revenue_raw_records_provider_ref_idx
  ON public.caza_revenue_raw_records (provider, external_reference);

CREATE OR REPLACE FUNCTION public.caza_revenue_raw_forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'caza_revenue_raw_records is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_caza_revenue_raw_no_update ON public.caza_revenue_raw_records;
CREATE TRIGGER trg_caza_revenue_raw_no_update
  BEFORE UPDATE ON public.caza_revenue_raw_records
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_raw_forbid_mutation();

DROP TRIGGER IF EXISTS trg_caza_revenue_raw_no_delete ON public.caza_revenue_raw_records;
CREATE TRIGGER trg_caza_revenue_raw_no_delete
  BEFORE DELETE ON public.caza_revenue_raw_records
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_raw_forbid_mutation();

-- ---------------------------------------------------------------------------
-- 4) caza_revenue_attributions — capa SEPARADA (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.caza_revenue_attributions (
  attribution_id text PRIMARY KEY,
  event_id text NOT NULL,
  decision text NOT NULL
    CHECK (decision IN ('ATTRIBUTED', 'UNKNOWN', 'UNMATCHED_TRACKING')),
  publication_id text NULL,
  deal_id text NULL,
  tracking_identifier text NULL,
  reason text NOT NULL,
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT caza_revenue_attributions_event_uidx UNIQUE (event_id),
  CONSTRAINT caza_revenue_attributions_attributed_requires_publication
    CHECK (
      (decision = 'ATTRIBUTED' AND publication_id IS NOT NULL)
      OR (decision <> 'ATTRIBUTED' AND publication_id IS NULL)
    )
);

COMMENT ON TABLE public.caza_revenue_attributions IS
  'CazaOfertasss FASE 3 — attribution decisions. SEPARATE from financial events. UNKNOWN stays UNKNOWN.';

CREATE INDEX IF NOT EXISTS caza_revenue_attributions_publication_idx
  ON public.caza_revenue_attributions (publication_id)
  WHERE publication_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.caza_revenue_attr_forbid_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'caza_revenue_attributions is append-only: % not allowed', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_caza_revenue_attr_no_update ON public.caza_revenue_attributions;
CREATE TRIGGER trg_caza_revenue_attr_no_update
  BEFORE UPDATE ON public.caza_revenue_attributions
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_attr_forbid_mutation();

DROP TRIGGER IF EXISTS trg_caza_revenue_attr_no_delete ON public.caza_revenue_attributions;
CREATE TRIGGER trg_caza_revenue_attr_no_delete
  BEFORE DELETE ON public.caza_revenue_attributions
  FOR EACH ROW EXECUTE FUNCTION public.caza_revenue_attr_forbid_mutation();

CREATE OR REPLACE FUNCTION public.caza_append_revenue_attribution(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.caza_revenue_attributions%ROWTYPE;
  v_appended boolean := false;
BEGIN
  IF p_row IS NULL OR p_row->>'attribution_id' IS NULL THEN
    RAISE EXCEPTION 'caza_append_revenue_attribution: attribution_id required';
  END IF;

  INSERT INTO public.caza_revenue_attributions AS t (
    attribution_id, event_id, decision, publication_id, deal_id,
    tracking_identifier, reason, decided_at
  )
  VALUES (
    p_row->>'attribution_id',
    p_row->>'event_id',
    p_row->>'decision',
    NULLIF(p_row->>'publication_id', ''),
    NULLIF(p_row->>'deal_id', ''),
    NULLIF(p_row->>'tracking_identifier', ''),
    p_row->>'reason',
    (p_row->>'decided_at')::timestamptz
  )
  ON CONFLICT (event_id) DO NOTHING
  RETURNING * INTO v_row;

  IF FOUND THEN
    v_appended := true;
  ELSE
    SELECT * INTO v_row
    FROM public.caza_revenue_attributions
    WHERE event_id = p_row->>'event_id';
  END IF;

  RETURN jsonb_build_object(
    'appended', v_appended,
    'duplicate', NOT v_appended,
    'row', to_jsonb(v_row)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.caza_append_revenue_attribution(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.caza_append_revenue_attribution(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) RLS fail-closed
-- ---------------------------------------------------------------------------

ALTER TABLE public.caza_revenue_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caza_revenue_raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caza_revenue_attributions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.caza_revenue_import_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.caza_revenue_raw_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.caza_revenue_attributions FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.caza_revenue_import_batches TO service_role;
GRANT ALL ON TABLE public.caza_revenue_raw_records TO service_role;
GRANT ALL ON TABLE public.caza_revenue_attributions TO service_role;

-- No policies for anon/authenticated → deny-by-default under RLS.
-- service_role bypasses RLS (server-only).
