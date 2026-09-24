-- Shadow decisions. Observe and shadow only.
-- mutates_production cannot be true.
-- Does not publish offers or move money.
-- MANUAL VERIFICATION: apply in Supabase after staging.

CREATE TABLE IF NOT EXISTS public.intelligence_shadow_decisions (
  idempotency_key text PRIMARY KEY,
  system text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('observe', 'shadow')),
  version text NOT NULL,
  decision text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_at timestamptz NOT NULL,
  mutates_production boolean NOT NULL DEFAULT false CHECK (mutates_production = false)
);

CREATE INDEX IF NOT EXISTS idx_intelligence_shadow_decisions_system
  ON public.intelligence_shadow_decisions (system, decided_at DESC);

ALTER TABLE public.intelligence_shadow_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intelligence_shadow_decisions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.intelligence_shadow_decisions TO service_role;

COMMENT ON TABLE public.intelligence_shadow_decisions IS
  'What intelligence would have done. Stage cannot be canary or enabled. Production state is not mutated.';
