-- FASE 10.2 — Supply Truth (append-only).
-- Qué produjo cada source en cada corrida. No es source health ni shadow.
-- Una fila por (run_id, source_id). Sin URLs, sin PII, sin secretos.
-- Solo service_role. Aplicar en Supabase SQL editor / CLI.

CREATE TABLE IF NOT EXISTS public.hunter_supply_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  source_id text NOT NULL,
  source_family text NOT NULL,
  source_lane text NOT NULL
    CHECK (source_lane IN ('community', 'machine')),
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  status text NOT NULL
    CHECK (status IN ('ok', 'degraded', 'failed', 'skipped', 'zero')),
  candidates_discovered integer NOT NULL DEFAULT 0 CHECK (candidates_discovered >= 0),
  candidates_qualified integer NOT NULL DEFAULT 0 CHECK (candidates_qualified >= 0),
  verified_deals integer NOT NULL DEFAULT 0 CHECK (verified_deals >= 0),
  promotions integer NOT NULL DEFAULT 0 CHECK (promotions >= 0),
  potential_deals integer NOT NULL DEFAULT 0 CHECK (potential_deals >= 0),
  catalog_only integer NOT NULL DEFAULT 0 CHECK (catalog_only >= 0),
  duplicates integer NOT NULL DEFAULT 0 CHECK (duplicates >= 0),
  rejected integer NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  pending integer NOT NULL DEFAULT 0 CHECK (pending >= 0),
  errors integer NOT NULL DEFAULT 0 CHECK (errors >= 0),
  duration_ms integer NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  shadow_cycle_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_supply_runs_run_source_unique UNIQUE (run_id, source_id),
  CONSTRAINT hunter_supply_runs_time_forward CHECK (finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_hunter_supply_runs_started_at
  ON public.hunter_supply_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_supply_runs_source_id
  ON public.hunter_supply_runs (source_id);

CREATE INDEX IF NOT EXISTS idx_hunter_supply_runs_source_family
  ON public.hunter_supply_runs (source_family);

CREATE INDEX IF NOT EXISTS idx_hunter_supply_runs_lane_started
  ON public.hunter_supply_runs (source_lane, started_at DESC);

COMMENT ON TABLE public.hunter_supply_runs IS
  'Snapshots append-only de supply por corrida/source. Verified deal contribution, no raw candidate count. Sin PII ni URLs.';

COMMENT ON COLUMN public.hunter_supply_runs.run_id IS
  'Identidad de la corrida. Idempotencia: UNIQUE (run_id, source_id).';

COMMENT ON COLUMN public.hunter_supply_runs.shadow_cycle_id IS
  'Referencia opcional a hunter_shadow_cycles.cycle_id. No es FK: Supply Truth ≠ Autonomous Shadow.';

COMMENT ON COLUMN public.hunter_supply_runs.verified_deals IS
  'Deal Qualification VERIFIED_DEAL. Métrica principal de contribution.';

ALTER TABLE public.hunter_supply_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hunter_supply_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_supply_runs TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_supply_aggregate(p_since timestamptz)
RETURNS TABLE (
  source_id text,
  source_family text,
  source_lane text,
  runs bigint,
  candidates_discovered bigint,
  candidates_qualified bigint,
  verified_deals bigint,
  promotions bigint,
  potential_deals bigint,
  catalog_only bigint,
  duplicates bigint,
  rejected bigint,
  pending bigint,
  errors bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    r.source_id,
    r.source_family,
    r.source_lane,
    count(*)::bigint,
    coalesce(sum(r.candidates_discovered), 0)::bigint,
    coalesce(sum(r.candidates_qualified), 0)::bigint,
    coalesce(sum(r.verified_deals), 0)::bigint,
    coalesce(sum(r.promotions), 0)::bigint,
    coalesce(sum(r.potential_deals), 0)::bigint,
    coalesce(sum(r.catalog_only), 0)::bigint,
    coalesce(sum(r.duplicates), 0)::bigint,
    coalesce(sum(r.rejected), 0)::bigint,
    coalesce(sum(r.pending), 0)::bigint,
    coalesce(sum(r.errors), 0)::bigint
  FROM public.hunter_supply_runs r
  WHERE r.started_at >= p_since
  GROUP BY r.source_id, r.source_family, r.source_lane
$$;

COMMENT ON FUNCTION public.hunter_supply_aggregate(timestamptz) IS
  'Agregación SQL de Supply Truth desde p_since. Service role only.';

REVOKE ALL ON FUNCTION public.hunter_supply_aggregate(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_supply_aggregate(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_supply_activity()
RETURNS TABLE (
  last_finished_at timestamptz,
  last_ok_at timestamptz,
  last_source_id text,
  last_run_id text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT r.finished_at FROM public.hunter_supply_runs r ORDER BY r.finished_at DESC LIMIT 1),
    (SELECT r.finished_at FROM public.hunter_supply_runs r WHERE r.status = 'ok' ORDER BY r.finished_at DESC LIMIT 1),
    (SELECT r.source_id FROM public.hunter_supply_runs r ORDER BY r.finished_at DESC LIMIT 1),
    (SELECT r.run_id FROM public.hunter_supply_runs r ORDER BY r.finished_at DESC LIMIT 1)
$$;

COMMENT ON FUNCTION public.hunter_supply_activity() IS
  'Última actividad persistida de Supply Truth. Service role only.';

REVOKE ALL ON FUNCTION public.hunter_supply_activity() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_supply_activity() TO service_role;
