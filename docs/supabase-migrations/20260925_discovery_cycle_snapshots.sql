-- Day 8 — Durable continuous-discovery VERIFIED-yield snapshots.
-- Append/upsert by cycle_id. No PII requirement; payload may include product ids from funnel.
-- Service role only. Fail-open in app if table missing.

CREATE TABLE IF NOT EXISTS public.discovery_cycle_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  dry_run boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT discovery_cycle_snapshots_cycle_unique UNIQUE (cycle_id),
  CONSTRAINT discovery_cycle_snapshots_time_forward CHECK (finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_discovery_cycle_snapshots_started
  ON public.discovery_cycle_snapshots (started_at DESC);

COMMENT ON TABLE public.discovery_cycle_snapshots IS
  'Day 8 durable VERIFIED-yield funnel per continuous discovery cycle. Service role only.';

ALTER TABLE public.discovery_cycle_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.discovery_cycle_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.discovery_cycle_snapshots TO service_role;
