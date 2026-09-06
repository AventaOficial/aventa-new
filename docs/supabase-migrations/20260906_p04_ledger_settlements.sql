-- P0-4: canal único de liquidación (ledger_settlements 1:1)
-- Política producto: solo creator_reward es pagable al creator.
-- Ejecutado en Production vía apply_migration (Supabase). Idempotente.

CREATE TABLE IF NOT EXISTS public.ledger_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ledger_entry_id uuid NOT NULL
    REFERENCES public.affiliate_ledger_entries(id) ON DELETE RESTRICT,
  channel text NOT NULL
    CHECK (channel IN ('creator_reward')),
  settlement_ref uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ledger_settlements_channel_created
  ON public.ledger_settlements (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_settlements_settlement_ref
  ON public.ledger_settlements (settlement_ref);

ALTER TABLE public.ledger_settlements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ledger_settlements FROM PUBLIC;
REVOKE ALL ON TABLE public.ledger_settlements FROM anon;
REVOKE ALL ON TABLE public.ledger_settlements FROM authenticated;
GRANT ALL ON TABLE public.ledger_settlements TO service_role;

COMMENT ON TABLE public.ledger_settlements IS
  'P0-4: claim 1:1 de liquidación pagable por ledger. Canal único: creator_reward.';

INSERT INTO public.ledger_settlements (ledger_entry_id, channel, settlement_ref)
SELECT cr.ledger_entry_id, 'creator_reward', cr.id
FROM public.creator_rewards cr
INNER JOIN public.affiliate_ledger_entries le ON le.id = cr.ledger_entry_id
ON CONFLICT (ledger_entry_id) DO NOTHING;
