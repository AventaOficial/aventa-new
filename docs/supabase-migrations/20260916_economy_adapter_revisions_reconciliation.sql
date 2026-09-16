-- Economy Layer: commission revisions + reconciliation foundation (ADITIVO).
-- NO liquida dinero. NO escribe rewards/payouts/ledger settlements.
-- Conversion status changes reutilizan affiliate_economic_events (sin tabla duplicada).
-- Idempotente. Sin operaciones destructivas.

-- ── Commission revisions (append-only amount history) ────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_commission_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  source text NOT NULL CHECK (source IN ('manual', 'csv_import', 'webhook', 'api')),
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  external_revision_id text NOT NULL,
  revision_kind text NOT NULL CHECK (revision_kind IN (
    'positive_adjustment', 'negative_adjustment', 'correction', 'reversal'
  )),
  -- delta: apply amount_delta_cents; replacement: set absolute_amount_cents as new effective base.
  semantics text NOT NULL CHECK (semantics IN ('delta', 'replacement')),
  amount_delta_cents bigint NULL,
  absolute_amount_cents bigint NULL CHECK (absolute_amount_cents IS NULL OR absolute_amount_cents >= 0),
  currency text NOT NULL,
  reason text NULL,
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN (
    'recorded', 'superseded', 'reversed'
  )),
  occurred_at timestamptz NOT NULL,
  raw_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_commission_revisions_external_unique
    UNIQUE (source, network, external_revision_id),
  CONSTRAINT affiliate_commission_revisions_amount_shape_check CHECK (
    (semantics = 'delta' AND amount_delta_cents IS NOT NULL AND absolute_amount_cents IS NULL)
    OR
    (semantics = 'replacement' AND absolute_amount_cents IS NOT NULL AND amount_delta_cents IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_revisions_commission
  ON public.affiliate_commission_revisions (commission_id, occurred_at ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_revisions_created
  ON public.affiliate_commission_revisions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_revisions_status
  ON public.affiliate_commission_revisions (status, occurred_at DESC);

COMMENT ON TABLE public.affiliate_commission_revisions IS
  'Append-only commission amount history. Never UPDATE gross_commission_cents silently. No ledger mutation.';

COMMENT ON COLUMN public.affiliate_commission_revisions.semantics IS
  'delta=apply amount_delta_cents; replacement=new absolute effective amount. Original commission row immutable.';

-- ── Reconciliation runs (compare network truth vs aventa; no money writes) ───
CREATE TABLE IF NOT EXISTS public.affiliate_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('manual', 'csv_import', 'webhook', 'api')),
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  -- Deterministic: source|network|window_start|window_end|snapshot_fingerprint
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'completed' CHECK (status IN (
    'completed', 'failed', 'partial'
  )),
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor text NOT NULL DEFAULT 'system',
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT affiliate_reconciliation_runs_window_check CHECK (window_end > window_start),
  CONSTRAINT affiliate_reconciliation_runs_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_reconciliation_runs_network_window
  ON public.affiliate_reconciliation_runs (network, window_start DESC, window_end DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_reconciliation_runs_created
  ON public.affiliate_reconciliation_runs (created_at DESC);

COMMENT ON TABLE public.affiliate_reconciliation_runs IS
  'Reconciliation foundation: network snapshot vs internal economic truth. Does not mutate money.';

-- ── Reconciliation findings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.affiliate_reconciliation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.affiliate_reconciliation_runs(id) ON DELETE CASCADE,
  finding_type text NOT NULL CHECK (finding_type IN (
    'MATCHED',
    'MISSING_INTERNAL',
    'MISSING_EXTERNAL',
    'AMOUNT_MISMATCH',
    'STATUS_MISMATCH',
    'CURRENCY_MISMATCH',
    'DUPLICATE',
    'ORPHAN'
  )),
  entity_kind text NOT NULL CHECK (entity_kind IN ('conversion', 'commission', 'revision')),
  external_id text NULL,
  internal_id text NULL,
  expected jsonb NOT NULL DEFAULT '{}'::jsonb,
  actual jsonb NOT NULL DEFAULT '{}'::jsonb,
  difference jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  source text NOT NULL,
  network text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_reconciliation_findings_run
  ON public.affiliate_reconciliation_findings (run_id, finding_type);

CREATE INDEX IF NOT EXISTS idx_affiliate_reconciliation_findings_type
  ON public.affiliate_reconciliation_findings (finding_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_reconciliation_findings_external
  ON public.affiliate_reconciliation_findings (source, network, external_id)
  WHERE external_id IS NOT NULL;

COMMENT ON TABLE public.affiliate_reconciliation_findings IS
  'Per-entity reconciliation outcomes. Informational only — never settles money.';

-- RLS fail-closed
ALTER TABLE public.affiliate_commission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_reconciliation_findings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliate_commission_revisions FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_commission_revisions FROM anon;
REVOKE ALL ON TABLE public.affiliate_commission_revisions FROM authenticated;
GRANT ALL ON TABLE public.affiliate_commission_revisions TO service_role;

REVOKE ALL ON TABLE public.affiliate_reconciliation_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_reconciliation_runs FROM anon;
REVOKE ALL ON TABLE public.affiliate_reconciliation_runs FROM authenticated;
GRANT ALL ON TABLE public.affiliate_reconciliation_runs TO service_role;

REVOKE ALL ON TABLE public.affiliate_reconciliation_findings FROM PUBLIC;
REVOKE ALL ON TABLE public.affiliate_reconciliation_findings FROM anon;
REVOKE ALL ON TABLE public.affiliate_reconciliation_findings FROM authenticated;
GRANT ALL ON TABLE public.affiliate_reconciliation_findings TO service_role;
