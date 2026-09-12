-- FASE 11 — Autonomous Shadow Calibration (append-only).
-- Correlación shadow decision ↔ human outcome. No es source health ni shadow cycle.
-- Una fila por offer_id cuando la identidad es fiable. Sin HTML, sin URLs, sin PII extra.
-- Solo service_role. Aplicar en Supabase SQL editor / CLI.
-- NO backfill histórico: sin offer_id en hunter_shadow_cycles no hay matching fiable.

CREATE TABLE IF NOT EXISTS public.hunter_shadow_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NULL,
  fingerprint text NULL,
  shadow_cycle_id uuid NULL,
  shadow_decision text NOT NULL
    CHECK (shadow_decision IN ('AUTO_APPROVE', 'HUMAN_REVIEW', 'AUTO_REJECT')),
  human_outcome text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (human_outcome IN (
      'HUMAN_APPROVED',
      'HUMAN_REJECTED',
      'HUMAN_SNOOZED',
      'HUMAN_PENDING',
      'HUMAN_EXPIRED',
      'UNKNOWN'
    )),
  match_confidence text NOT NULL DEFAULT 'unmatched'
    CHECK (match_confidence IN ('offer_id', 'fingerprint_unique', 'ambiguous', 'unmatched')),
  matched_at timestamptz NULL,
  human_action_at timestamptz NULL,
  human_actor_kind text NULL
    CHECK (human_actor_kind IS NULL OR human_actor_kind IN (
      'human_moderator',
      'system_lifecycle',
      'legacy_auto',
      'unknown'
    )),
  source_id text NOT NULL,
  source_family text NOT NULL,
  score numeric NULL,
  confidence numeric NULL,
  qualification text NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  duplicate_status text NULL,
  seller_status text NULL,
  image_status text NULL,
  monetization_status text NULL,
  policy_version text NOT NULL,
  creator_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_shadow_outcomes_offer_unique UNIQUE (offer_id)
);

CREATE INDEX IF NOT EXISTS idx_hunter_shadow_outcomes_created_at
  ON public.hunter_shadow_outcomes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hunter_shadow_outcomes_decision_outcome
  ON public.hunter_shadow_outcomes (shadow_decision, human_outcome);

CREATE INDEX IF NOT EXISTS idx_hunter_shadow_outcomes_source
  ON public.hunter_shadow_outcomes (source_id, source_family);

CREATE INDEX IF NOT EXISTS idx_hunter_shadow_outcomes_creator
  ON public.hunter_shadow_outcomes (creator_id)
  WHERE creator_id IS NOT NULL;

COMMENT ON TABLE public.hunter_shadow_outcomes IS
  'Correlación append-only Autonomous Shadow vs human outcome. moderation_logs sigue siendo la fuente de la acción humana. Sin PII extra ni payloads.';

COMMENT ON COLUMN public.hunter_shadow_outcomes.offer_id IS
  'Identidad fuerte. Sin offer_id no hay correlación fiable. UNIQUE: un snapshot shadow por oferta.';

COMMENT ON COLUMN public.hunter_shadow_outcomes.human_outcome IS
  'UNKNOWN hasta un evento humano fiable. No inferir de offers.status (bot/legacy/expire).';

COMMENT ON COLUMN public.hunter_shadow_outcomes.policy_version IS
  'AUTONOMOUS_DECISION_POLICY_V1 al observar. Permite comparar tras un cambio futuro de policy.';

COMMENT ON COLUMN public.hunter_shadow_outcomes.fingerprint IS
  'Diagnóstico. Nunca se usa solo para correlacionar si hay ambigüedad.';

ALTER TABLE public.hunter_shadow_outcomes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hunter_shadow_outcomes FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.hunter_shadow_outcomes TO service_role;

-- Agregados. El admin no baja miles de filas a Node.

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_summary(p_since timestamptz)
RETURNS TABLE (
  shadow_evaluated bigint,
  shadow_matched bigint,
  shadow_unknown bigint,
  auto_approve bigint,
  auto_approve_human_approved bigint,
  auto_approve_human_rejected bigint,
  auto_reject bigint,
  auto_reject_human_approved bigint,
  auto_reject_human_rejected bigint,
  human_review bigint,
  human_review_approved bigint,
  human_review_rejected bigint,
  agreement bigint,
  disagreement bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (WHERE human_outcome IN ('UNKNOWN', 'HUMAN_PENDING'))::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_APPROVE')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_APPROVE' AND human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_APPROVE' AND human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_REJECT')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_REJECT' AND human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'AUTO_REJECT' AND human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'HUMAN_REVIEW')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'HUMAN_REVIEW' AND human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE shadow_decision = 'HUMAN_REVIEW' AND human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (
      WHERE (shadow_decision = 'AUTO_APPROVE' AND human_outcome = 'HUMAN_APPROVED')
         OR (shadow_decision = 'AUTO_REJECT' AND human_outcome = 'HUMAN_REJECTED')
    )::bigint,
    count(*) FILTER (
      WHERE (shadow_decision = 'AUTO_APPROVE' AND human_outcome = 'HUMAN_REJECTED')
         OR (shadow_decision = 'AUTO_REJECT' AND human_outcome = 'HUMAN_APPROVED')
    )::bigint
  FROM public.hunter_shadow_outcomes
  WHERE created_at >= p_since
$$;

COMMENT ON FUNCTION public.hunter_shadow_calibration_summary(timestamptz) IS
  'Agregado global de calibración shadow↔humano. Service role only.';

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_summary(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_by_source(p_since timestamptz)
RETURNS TABLE (
  source_id text,
  source_family text,
  evaluated bigint,
  matched bigint,
  agreement bigint,
  disagreement bigint,
  auto_approve bigint,
  auto_approve_human_approved bigint,
  auto_approve_human_rejected bigint,
  auto_reject bigint,
  auto_reject_human_approved bigint,
  auto_reject_human_rejected bigint,
  human_review bigint,
  human_review_approved bigint,
  human_review_rejected bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.source_id,
    o.source_family,
    count(*)::bigint,
    count(*) FILTER (WHERE o.human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_APPROVED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_REJECTED')
    )::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_REJECTED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_APPROVED')
    )::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_APPROVE')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_REJECT')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'HUMAN_REVIEW')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'HUMAN_REVIEW' AND o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'HUMAN_REVIEW' AND o.human_outcome = 'HUMAN_REJECTED')::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
  GROUP BY o.source_id, o.source_family
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_by_source(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_by_source(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_by_creator(p_since timestamptz)
RETURNS TABLE (
  creator_id uuid,
  submissions bigint,
  matched bigint,
  agreement bigint,
  auto_approve bigint,
  human_review bigint,
  auto_reject bigint,
  human_approved bigint,
  human_rejected bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.creator_id,
    count(*)::bigint,
    count(*) FILTER (WHERE o.human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_APPROVED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_REJECTED')
    )::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_APPROVE')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'HUMAN_REVIEW')::bigint,
    count(*) FILTER (WHERE o.shadow_decision = 'AUTO_REJECT')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_REJECTED')::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
    AND o.creator_id IS NOT NULL
  GROUP BY o.creator_id
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_by_creator(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_by_creator(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_reasons(p_since timestamptz)
RETURNS TABLE (
  pair text,
  reason_code text,
  count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    x.pair,
    x.reason_code,
    count(*)::bigint
  FROM (
    SELECT
      CASE
        WHEN o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_REJECTED'
          THEN 'AUTO_APPROVE+HUMAN_REJECT'
        WHEN o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_APPROVED'
          THEN 'AUTO_REJECT+HUMAN_APPROVE'
        WHEN o.shadow_decision = 'HUMAN_REVIEW' AND o.human_outcome = 'HUMAN_APPROVED'
          THEN 'HUMAN_REVIEW+HUMAN_APPROVE'
        WHEN o.shadow_decision = 'HUMAN_REVIEW' AND o.human_outcome = 'HUMAN_REJECTED'
          THEN 'HUMAN_REVIEW+HUMAN_REJECT'
        ELSE NULL
      END AS pair,
      jsonb_array_elements_text(COALESCE(o.reason_codes, '[]'::jsonb)) AS reason_code
    FROM public.hunter_shadow_outcomes o
    WHERE o.created_at >= p_since
  ) x
  WHERE x.pair IS NOT NULL
    AND x.reason_code IS NOT NULL
    AND length(x.reason_code) > 0
  GROUP BY x.pair, x.reason_code
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_reasons(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_reasons(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_score_buckets(p_since timestamptz)
RETURNS TABLE (
  bucket text,
  evaluated bigint,
  matched bigint,
  agreement bigint,
  disagreement bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN o.score IS NULL THEN 'unknown'
      WHEN o.score < 40 THEN '0-39'
      WHEN o.score < 55 THEN '40-54'
      WHEN o.score < 70 THEN '55-69'
      WHEN o.score < 78 THEN '70-77'
      WHEN o.score < 85 THEN '78-84'
      ELSE '85+'
    END AS bucket,
    count(*)::bigint,
    count(*) FILTER (WHERE o.human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_APPROVED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_REJECTED')
    )::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_REJECTED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_APPROVED')
    )::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
  GROUP BY 1
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_score_buckets(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_score_buckets(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_confidence_buckets(p_since timestamptz)
RETURNS TABLE (
  bucket text,
  evaluated bigint,
  matched bigint,
  agreement bigint,
  disagreement bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    CASE
      WHEN o.confidence IS NULL THEN 'unknown'
      WHEN o.confidence < 0.50 THEN '0-0.49'
      WHEN o.confidence < 0.70 THEN '0.50-0.69'
      WHEN o.confidence < 0.85 THEN '0.70-0.84'
      ELSE '0.85+'
    END AS bucket,
    count(*)::bigint,
    count(*) FILTER (WHERE o.human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_APPROVED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_REJECTED')
    )::bigint,
    count(*) FILTER (
      WHERE (o.shadow_decision = 'AUTO_APPROVE' AND o.human_outcome = 'HUMAN_REJECTED')
         OR (o.shadow_decision = 'AUTO_REJECT' AND o.human_outcome = 'HUMAN_APPROVED')
    )::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
  GROUP BY 1
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_confidence_buckets(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_confidence_buckets(timestamptz) TO service_role;
