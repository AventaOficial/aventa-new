-- M4.1 Payout Intent Foundation (ADITIVO).
-- Claim 1:1 reward → intent. No dinero real. No provider externo.
-- Legacy reward_payouts / execute_reward_payout permanecen; no son authority de este flujo.
-- Idempotente. Sin operaciones destructivas.

CREATE TABLE IF NOT EXISTS public.payout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_id uuid NOT NULL REFERENCES public.creator_rewards(id) ON DELETE RESTRICT,
  creator_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'RESERVED' CHECK (status IN (
    'RESERVED', 'SUBMITTED', 'SUCCEEDED', 'FAILED', 'UNKNOWN', 'CANCELLED'
  )),
  idempotency_key text NOT NULL,
  provider text NOT NULL DEFAULT 'stub',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  resolved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_intents_reward_unique UNIQUE (reward_id),
  CONSTRAINT payout_intents_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payout_intents_creator_status
  ON public.payout_intents (creator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payout_intents_status_created
  ON public.payout_intents (status, created_at DESC);

ALTER TABLE public.payout_intents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.payout_intents FROM PUBLIC;
REVOKE ALL ON TABLE public.payout_intents FROM anon;
REVOKE ALL ON TABLE public.payout_intents FROM authenticated;
GRANT ALL ON TABLE public.payout_intents TO service_role;

COMMENT ON TABLE public.payout_intents IS
  'M4.1: claim 1:1 de intención de payout por creator_reward. Authority separada de reward_payouts legacy.';
COMMENT ON COLUMN public.payout_intents.idempotency_key IS
  'Key estable generada antes de cualquier provider call. Nunca regenerar en UNKNOWN/retry.';
COMMENT ON COLUMN public.payout_intents.status IS
  'RESERVED→SUBMITTED→SUCCEEDED|FAILED|UNKNOWN. UNKNOWN solo cierra vía reconciliation.';
