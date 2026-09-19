-- S8.1 Hunter Benchmark — STAGING ONLY.
-- Evidence for external hunter comparisons. Never used by production supply router.
-- Apply manually in staging Supabase. service_role only.

CREATE TABLE IF NOT EXISTS public.hunter_benchmark_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  hunter_id text NOT NULL,
  source_id text NOT NULL,
  schema_version text NOT NULL DEFAULT 'hunter_benchmark.v1',
  collected_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  candidates_found integer NOT NULL DEFAULT 0,
  verified_opportunities integer NOT NULL DEFAULT 0,
  precision numeric NULL,
  price_accuracy numeric NULL,
  detection_latency_ms integer NULL,
  error_code text NULL,
  error_message_safe text NULL,
  report_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_benchmark_runs_unique UNIQUE (hunter_id, run_id)
);

CREATE TABLE IF NOT EXISTS public.hunter_benchmark_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_run_id uuid NOT NULL REFERENCES public.hunter_benchmark_runs(id) ON DELETE CASCADE,
  candidate_id text NOT NULL,
  candidate_key text NULL,
  source_url text NULL,
  title text NULL,
  current_price numeric NULL,
  original_price numeric NULL,
  currency text NULL,
  discovered_at timestamptz NULL,
  aventa_is_opportunity boolean NULL,
  aventa_verified boolean NULL,
  matched boolean NOT NULL DEFAULT false,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_benchmark_results_run_candidate UNIQUE (benchmark_run_id, candidate_id)
);

CREATE INDEX IF NOT EXISTS idx_hunter_benchmark_runs_created_at
  ON public.hunter_benchmark_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_benchmark_runs_source
  ON public.hunter_benchmark_runs (source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_benchmark_results_run
  ON public.hunter_benchmark_results (benchmark_run_id);

ALTER TABLE public.hunter_benchmark_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunter_benchmark_results ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hunter_benchmark_runs FROM anon, authenticated;
REVOKE ALL ON public.hunter_benchmark_results FROM anon, authenticated;
