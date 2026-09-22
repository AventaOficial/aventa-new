-- Hunter Discovery Scheduler state — additive, observation scheduling only.
-- Safe to apply. No money/publish/reward columns.
-- Persists adaptive exploration/exploitation cursors across serverless processes.

CREATE TABLE IF NOT EXISTS public.hunter_discovery_scheduler_state (
  id text PRIMARY KEY DEFAULT 'default',
  day_key text NOT NULL,
  last_run_slot bigint NOT NULL DEFAULT 0,
  last_query_offset int NOT NULL DEFAULT 0,
  last_category_offset int NOT NULL DEFAULT 0,
  last_seed_offset int NOT NULL DEFAULT 0,
  seen_query_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  seen_category_keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  page_policy text NOT NULL DEFAULT 'page_1_only',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hunter_discovery_scheduler_state IS
  'Adaptive discovery cursors. Observation scheduling only. Never mint.';

ALTER TABLE public.hunter_discovery_scheduler_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hunter_discovery_scheduler_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_discovery_scheduler_state TO service_role;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_rot_query_idx
  ON public.hunter_offer_candidates (rot_query)
  WHERE rot_query IS NOT NULL;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_rot_seed_idx
  ON public.hunter_offer_candidates (rot_seed_id)
  WHERE rot_seed_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_discount_class_idx
  ON public.hunter_offer_candidates (discount_class, discovered_at DESC);
