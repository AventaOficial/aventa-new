-- AVENTA Rewards V1 — esquema aditivo (no ejecutar en prod sin revisión del owner).
-- Comisión = ingreso de red a Aventa (affiliate_ledger_entries).
-- Recompensa = parte asignada al creador (creator_rewards).
-- Pago = transferencia SPEI manual (reward_payouts).

-- ── Perfil: membresía del programa ───────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS reward_program_unlocked_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS welcome_offer_id uuid NULL,
  ADD COLUMN IF NOT EXISTS welcome_offer_selected_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.reward_program_unlocked_at IS
  'Momento en que el usuario desbloqueó el Programa de Recompensas (15 ofertas + 15 votos acumulados).';
COMMENT ON COLUMN public.profiles.welcome_offer_id IS
  'Oferta de Bienvenida elegida (una de las primeras 15 aprobadas). Inmutable tras selección.';
COMMENT ON COLUMN public.profiles.welcome_offer_selected_at IS
  'Timestamp de selección de Oferta de Bienvenida.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_welcome_offer_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_welcome_offer_id_fkey
      FOREIGN KEY (welcome_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Clics salientes (atribución) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_outbound_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  network text NOT NULL CHECK (network IN (
    'amazon', 'mercadolibre', 'aliexpress', 'temu', 'walmart', 'shein', 'other'
  )),
  product_fingerprint text NULL,
  clicker_user_id uuid NULL,
  ip_hash text NULL,
  user_agent_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_offer_created
  ON public.reward_outbound_clicks (offer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reward_outbound_clicks_product_created
  ON public.reward_outbound_clicks (product_fingerprint, created_at DESC)
  WHERE product_fingerprint IS NOT NULL AND btrim(product_fingerprint) <> '';

ALTER TABLE public.reward_outbound_clicks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM anon;
REVOKE ALL ON TABLE public.reward_outbound_clicks FROM authenticated;
GRANT ALL ON TABLE public.reward_outbound_clicks TO service_role;

-- ── Ledger: columnas de atribución (aditivas) ────────────────────────────────
ALTER TABLE public.affiliate_ledger_entries
  ADD COLUMN IF NOT EXISTS click_id uuid NULL,
  ADD COLUMN IF NOT EXISTS attribution_method text NULL,
  ADD COLUMN IF NOT EXISTS attribution_confidence text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'affiliate_ledger_click_id_fkey'
  ) THEN
    ALTER TABLE public.affiliate_ledger_entries
      ADD CONSTRAINT affiliate_ledger_click_id_fkey
      FOREIGN KEY (click_id) REFERENCES public.reward_outbound_clicks(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.affiliate_ledger_entries
  DROP CONSTRAINT IF EXISTS affiliate_ledger_attribution_method_check;
ALTER TABLE public.affiliate_ledger_entries
  ADD CONSTRAINT affiliate_ledger_attribution_method_check
  CHECK (attribution_method IS NULL OR attribution_method IN (
    'sub_id', 'product_click_window', 'manual', 'none'
  ));

ALTER TABLE public.affiliate_ledger_entries
  DROP CONSTRAINT IF EXISTS affiliate_ledger_attribution_confidence_check;
ALTER TABLE public.affiliate_ledger_entries
  ADD CONSTRAINT affiliate_ledger_attribution_confidence_check
  CHECK (attribution_confidence IS NULL OR attribution_confidence IN (
    'high', 'medium', 'low', 'none'
  ));

-- ── Recompensas al creador ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL,
  offer_id uuid NULL REFERENCES public.offers(id) ON DELETE SET NULL,
  ledger_entry_id uuid NOT NULL REFERENCES public.affiliate_ledger_entries(id) ON DELETE RESTRICT,
  network text NOT NULL,
  gross_commission_cents bigint NOT NULL CHECK (gross_commission_cents >= 0),
  creator_share_cents bigint NOT NULL CHECK (creator_share_cents >= 0),
  platform_share_cents bigint NOT NULL CHECK (platform_share_cents >= 0),
  creator_share_bps integer NOT NULL CHECK (creator_share_bps >= 0 AND creator_share_bps <= 10000),
  currency text NOT NULL DEFAULT 'MXN',
  attribution_method text NOT NULL CHECK (attribution_method IN (
    'sub_id', 'product_click_window', 'manual'
  )),
  attribution_confidence text NOT NULL CHECK (attribution_confidence IN ('high', 'medium')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING', 'VALIDATING', 'AVAILABLE', 'PAID', 'CANCELLED', 'REVERSED'
  )),
  hold_until timestamptz NOT NULL,
  available_at timestamptz NULL,
  paid_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  reversed_at timestamptz NULL,
  payout_id uuid NULL,
  fraud_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_rewards_creator_status
  ON public.creator_rewards (creator_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_rewards_offer
  ON public.creator_rewards (offer_id, created_at DESC)
  WHERE offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_creator_rewards_hold
  ON public.creator_rewards (status, hold_until)
  WHERE status = 'VALIDATING';

ALTER TABLE public.creator_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_rewards FROM PUBLIC;
REVOKE ALL ON TABLE public.creator_rewards FROM anon;
REVOKE ALL ON TABLE public.creator_rewards FROM authenticated;
GRANT ALL ON TABLE public.creator_rewards TO service_role;

-- ── Pagos SPEI manuales ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'MXN',
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
  spei_reference text NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL,
  notes text NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_payouts_user
  ON public.reward_payouts (user_id, paid_at DESC);

ALTER TABLE public.reward_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_payouts FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_payouts FROM anon;
REVOKE ALL ON TABLE public.reward_payouts FROM authenticated;
GRANT ALL ON TABLE public.reward_payouts TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'creator_rewards_payout_id_fkey'
  ) THEN
    ALTER TABLE public.creator_rewards
      ADD CONSTRAINT creator_rewards_payout_id_fkey
      FOREIGN KEY (payout_id) REFERENCES public.reward_payouts(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Auditoría financiera Rewards ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reward_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  actor_id uuid NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  previous_state text NULL,
  new_state text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_audit_entity
  ON public.reward_audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reward_audit_event
  ON public.reward_audit_log (event_type, created_at DESC);

ALTER TABLE public.reward_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reward_audit_log FROM PUBLIC;
REVOKE ALL ON TABLE public.reward_audit_log FROM anon;
REVOKE ALL ON TABLE public.reward_audit_log FROM authenticated;
GRANT ALL ON TABLE public.reward_audit_log TO service_role;

COMMENT ON TABLE public.creator_rewards IS
  'Recompensas V1: parte de comisión atribuida al creador de la oferta.';
COMMENT ON TABLE public.reward_payouts IS
  'Pagos SPEI manuales de recompensas AVAILABLE.';
COMMENT ON TABLE public.reward_audit_log IS
  'Auditoría de acciones del Programa de Recompensas.';
