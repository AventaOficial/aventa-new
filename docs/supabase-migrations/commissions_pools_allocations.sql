-- Pools y asignaciones mensuales del programa de comisiones (creadores).
-- Fuente de ingreso: affiliate_ledger_entries (ingreso plataforma).
-- Reparto: lo calcula API admin por periodo y guarda snapshot auditable.

CREATE TABLE IF NOT EXISTS public.commission_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_key text NOT NULL UNIQUE CHECK (period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_affiliate_cents bigint NOT NULL DEFAULT 0,
  creator_share_bps integer NOT NULL CHECK (creator_share_bps >= 0 AND creator_share_bps <= 10000),
  distributable_cents bigint NOT NULL DEFAULT 0,
  eligible_users integer NOT NULL DEFAULT 0,
  total_points integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'locked' CHECK (status IN ('draft', 'locked', 'paid', 'cancelled')),
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commission_pools_period ON public.commission_pools (period_start, period_end);

CREATE TABLE IF NOT EXISTS public.commission_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES public.commission_pools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  amount_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
  paid_at timestamptz NULL,
  notes text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pool_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_commission_allocations_pool_status
  ON public.commission_allocations (pool_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_commission_allocations_user
  ON public.commission_allocations (user_id, created_at DESC);

ALTER TABLE public.commission_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_allocations ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.commission_pools IS
  'Snapshot mensual del reparto para creadores: ingresos de afiliado, % para creadores y totales.';

COMMENT ON TABLE public.commission_allocations IS
  'Monto asignado por usuario en un pool mensual (pendiente, pagado o void).';
