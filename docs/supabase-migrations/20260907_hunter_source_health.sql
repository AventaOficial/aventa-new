-- Hunter multifuente: estado de salud y circuit breaker por fuente.
-- Solo service_role (sin tokens ni secretos). Aplicar en Supabase SQL editor / CLI.

CREATE TABLE IF NOT EXISTS public.hunter_source_health (
  source_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'degraded'
    CHECK (status IN ('healthy', 'degraded', 'down', 'disabled')),
  breaker_state text NOT NULL DEFAULT 'closed'
    CHECK (breaker_state IN ('closed', 'open', 'half_open')),
  last_run_at timestamptz NULL,
  last_success_at timestamptz NULL,
  last_failure_at timestamptz NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_inserted integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  skipped integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  latency_ms integer NULL,
  last_error_code text NULL,
  last_error_message_safe text NULL,
  cooldown_until timestamptz NULL,
  expected_interval_ms integer NOT NULL DEFAULT 900000,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hunter_source_health IS
  'Salud y circuit breaker del Hunter Engine por fuente. Sin secretos.';

ALTER TABLE public.hunter_source_health ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hunter_source_health FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_source_health TO service_role;
