-- Conversion + Commission Foundation (ADITIVO).
-- NO liquida dinero. NO escribe tablas de rewards/payouts ni settlements del ledger.
-- Ledger boundary: affiliate_commissions.ledger_entry_id permanece NULL hasta fase settlement.
-- Idempotente. Sin operaciones destructivas.
-- Rollback (manual, not executed by this file): remove the three new tables in reverse FK order.

-- ── Conversions (eventos de orden/compra de red) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('manual', 'csv_import', 'webhook', 'api')),
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  external_conversion_id text NOT NULL,
  click_id uuid NULL REFERENCES public.reward_outbound_clicks(id) ON DELETE SET NULL,
  offer_id uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  attribution_status text NOT NULL CHECK (attribution_status IN (
    'attributed', 'unattributed', 'unresolved'
  )),
  status text NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'pending', 'confirmed', 'rejected', 'reversed'
  )),
  occurred_at timestamptz NOT NULL,
  order_amount_cents bigint NULL CHECK (order_amount_cents IS NULL OR order_amount_cents >= 0),
  currency text NULL,
  raw_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  attribution_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_conversions_external_unique
    UNIQUE (source, network, external_conversion_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_click
  ON public.affiliate_conversions (click_id)
  WHERE click_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_offer_occurred
  ON public.affiliate_conversions (offer_id, occurred_at DESC)
  WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_status_occurred
  ON public.affiliate_conversions (status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_conversions_created
  ON public.affiliate_conversions (created_at DESC);

COMMENT ON TABLE public.affiliate_conversions IS
  'Conversion Foundation: eventos de conversión de red. Nunca inventados desde clicks. No liquida dinero.';

COMMENT ON COLUMN public.affiliate_conversions.attribution_status IS
  'attributed=click_id válido; unattributed=sin click; unresolved=click_id no resoluble.';

COMMENT ON COLUMN public.affiliate_conversions.order_amount_cents IS
  'Valor de orden reportado por la fuente (opcional). NO es commission.';

-- ── Commissions (importe económico reportado por red) ────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversion_id uuid NOT NULL REFERENCES public.affiliate_conversions(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual', 'csv_import', 'webhook', 'api')),
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  external_commission_id text NOT NULL,
  gross_commission_cents bigint NOT NULL CHECK (gross_commission_cents >= 0),
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported', 'pending', 'approved', 'rejected', 'reversed'
  )),
  occurred_at timestamptz NOT NULL,
  -- Boundary: NULL hasta settlement futuro. Foundation NUNCA lo escribe.
  ledger_entry_id uuid NULL REFERENCES public.affiliate_ledger_entries(id) ON DELETE SET NULL,
  raw_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commissions_external_unique
    UNIQUE (source, network, external_commission_id)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_conversion
  ON public.affiliate_commissions (conversion_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status_occurred
  ON public.affiliate_commissions (status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_ledger
  ON public.affiliate_commissions (ledger_entry_id)
  WHERE ledger_entry_id IS NOT NULL;

COMMENT ON TABLE public.affiliate_commissions IS
  'Commission Foundation: importe confirmado/reportado por red. No liquida dinero. ledger_entry_id null hasta settlement.';

COMMENT ON COLUMN public.affiliate_commissions.ledger_entry_id IS
  'FK opcional a asiento contable. Foundation leave NULL — payout path disabled.';

-- ── Append-only economic audit events ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_economic_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('conversion', 'commission')),
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  from_status text NULL,
  to_status text NULL,
  actor text NOT NULL DEFAULT 'system',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_economic_events_entity
  ON public.affiliate_economic_events (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_economic_events_created
  ON public.affiliate_economic_events (created_at DESC);

COMMENT ON TABLE public.affiliate_economic_events IS
  'Audit append-only de conversion/commission. Sin PII. Sin secretos.';

-- RLS: solo service_role (igual que ledger/clicks rewards).
ALTER TABLE public.affiliate_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_economic_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliate_conversions FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_conversions FROM anon;
REVOKE ALL ON TABLE public.affiliate_conversions FROM authenticated;
GRANT ALL ON TABLE public.affiliate_conversions TO service_role;

REVOKE ALL ON TABLE public.affiliate_commissions FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_commissions FROM anon;
REVOKE ALL ON TABLE public.affiliate_commissions FROM authenticated;
GRANT ALL ON TABLE public.affiliate_commissions TO service_role;

REVOKE ALL ON TABLE public.affiliate_economic_events FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_economic_events FROM anon;
REVOKE ALL ON TABLE public.affiliate_economic_events FROM authenticated;
GRANT ALL ON TABLE public.affiliate_economic_events TO service_role;
