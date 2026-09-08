-- Snapshot por ciclo del Autonomous Decision Engine (SHADOW ONLY).
-- Agregados por ciclo: sin URLs, sin títulos, sin candidatos individuales, sin secretos.
-- Append-only: un INSERT por ciclo. No hay UPDATE ni DELETE desde la app.
-- Solo service_role. Aplicar en Supabase SQL editor / CLI.

CREATE TABLE IF NOT EXISTS public.hunter_shadow_cycles (
  cycle_id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  evaluated integer NOT NULL DEFAULT 0,
  auto_approve integer NOT NULL DEFAULT 0,
  human_review integer NOT NULL DEFAULT 0,
  auto_reject integer NOT NULL DEFAULT 0,
  auto_approve_pct numeric NOT NULL DEFAULT 0,
  human_review_pct numeric NOT NULL DEFAULT 0,
  auto_reject_pct numeric NOT NULL DEFAULT 0,
  autonomous_pct numeric NOT NULL DEFAULT 0,
  avg_confidence numeric NOT NULL DEFAULT 0,
  avg_score numeric NULL,
  duplicate_pass integer NOT NULL DEFAULT 0,
  duplicate_fail integer NOT NULL DEFAULT 0,
  duplicate_unknown integer NOT NULL DEFAULT 0,
  image_found integer NOT NULL DEFAULT 0,
  image_missing integer NOT NULL DEFAULT 0,
  top_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  by_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  schema_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_shadow_cycles_evaluated_nonneg CHECK (evaluated >= 0),
  CONSTRAINT hunter_shadow_cycles_decisions_sum
    CHECK (auto_approve + human_review + auto_reject <= evaluated)
);

CREATE INDEX IF NOT EXISTS idx_hunter_shadow_cycles_finished_at
  ON public.hunter_shadow_cycles (finished_at DESC);

COMMENT ON TABLE public.hunter_shadow_cycles IS
  'Snapshot agregado por ciclo del Autonomous Decision Engine en modo shadow. Append-only, sin PII ni URLs.';

COMMENT ON COLUMN public.hunter_shadow_cycles.policy_version IS
  'AUTONOMOUS_DECISION_POLICY_V1 vigente al cerrar el ciclo. Sin esto los ciclos no son comparables.';

COMMENT ON COLUMN public.hunter_shadow_cycles.schema_version IS
  'SHADOW_CYCLE_SCHEMA_VERSION del writer que insertó la fila.';

ALTER TABLE public.hunter_shadow_cycles ENABLE ROW LEVEL SECURITY;

-- Sin policies: RLS activo y sin policy = nadie lee/escribe salvo service_role (bypass).
REVOKE ALL ON TABLE public.hunter_shadow_cycles FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_shadow_cycles TO service_role;
