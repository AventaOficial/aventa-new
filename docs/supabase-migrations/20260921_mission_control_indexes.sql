-- Mission Control / universe indexes — additive only.
-- Observation. Does NOT change productive gates or mint.

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_discovered_at_idx
  ON public.hunter_offer_candidates (discovered_at DESC);

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_decision_discovered_idx
  ON public.hunter_offer_candidates (decision, discovered_at DESC);

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_source_discovered_idx
  ON public.hunter_offer_candidates (source, discovered_at DESC)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_funnel_stage_idx
  ON public.hunter_offer_candidates (funnel_stage)
  WHERE funnel_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_rot_query_idx
  ON public.hunter_offer_candidates (rot_query)
  WHERE rot_query IS NOT NULL;

COMMENT ON INDEX public.hunter_offer_candidates_discovered_at_idx IS
  'Mission Control / Hunter Lab universe window queries (since/until).';

SELECT 1;
