-- Centro de Pagos V3 — lotes de pago persistidos (docs/SYSTEMS/SYSTEM_payout_operations.md §5, §9)
-- Un lote es una foto aprobada de "quién cobra cuánto" en un periodo. NO mueve dinero:
-- la salida sigue siendo payout_intents (idempotente) y sus guards (freeze / programa / proveedor).
-- Regla de dos personas: approved_by <> prepared_by salvo override explícito del owner (meta.self_approved).

CREATE TABLE IF NOT EXISTS public.payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL,                       -- 'YYYY-MM'
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'released', 'cancelled')),
  currency text NOT NULL DEFAULT 'MXN',
  payable_cents bigint NOT NULL DEFAULT 0,
  payable_count integer NOT NULL DEFAULT 0,
  review_count integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  carry_count integer NOT NULL DEFAULT 0,
  min_payout_cents integer NOT NULL,
  creator_share_bps integer NOT NULL,
  prepared_by uuid,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  released_by uuid,
  released_at timestamptz,
  cancelled_by uuid,
  cancelled_at timestamptz,
  notes text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Solo un lote "vivo" (draft|approved) por periodo.
CREATE UNIQUE INDEX IF NOT EXISTS payout_batches_active_period_unique
  ON public.payout_batches (period_key)
  WHERE status IN ('draft', 'approved');

CREATE INDEX IF NOT EXISTS idx_payout_batches_status_created
  ON public.payout_batches (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.payout_batch_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.payout_batches(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL,
  amount_cents bigint NOT NULL,
  reward_count integer NOT NULL DEFAULT 0,
  reward_ids uuid[] NOT NULL DEFAULT '{}',
  decision text NOT NULL CHECK (decision IN ('pass', 'review', 'fail', 'carry')),
  gate_codes text[] NOT NULL DEFAULT '{}',
  gate_reasons text[] NOT NULL DEFAULT '{}',
  display_name text,
  release_status text NOT NULL DEFAULT 'none'
    CHECK (release_status IN ('none', 'reserved', 'reused', 'deferred', 'rejected')),
  release_reason text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_batch_lines_batch_creator_unique UNIQUE (batch_id, creator_id)
);

CREATE INDEX IF NOT EXISTS idx_payout_batch_lines_batch
  ON public.payout_batch_lines (batch_id, decision);

CREATE INDEX IF NOT EXISTS idx_payout_batch_lines_reward_ids
  ON public.payout_batch_lines USING gin (reward_ids);

ALTER TABLE public.payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_batch_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payout_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.payout_batch_lines FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.payout_batches TO service_role;
GRANT ALL ON public.payout_batch_lines TO service_role;

COMMENT ON TABLE public.payout_batches IS
  'Centro de Pagos V3: foto aprobada de quién cobra en un periodo. No mueve dinero; la salida es payout_intents.';
COMMENT ON COLUMN public.payout_batches.status IS
  'draft → approved (dos personas) → released (intents reservados) | cancelled';
COMMENT ON TABLE public.payout_batch_lines IS
  'Líneas por creador con decisión de gates (pass/review/fail/carry) y resultado de liberación.';
