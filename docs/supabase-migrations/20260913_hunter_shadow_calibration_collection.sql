-- FASE 11.1 — Calibration Data Collection (additive RPCs).
-- No nueva tabla. No backfill. No cambia hunter_shadow_outcomes.
-- Solo agregados para volumen, lag y breakdown de recolección.

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_collection(p_since timestamptz)
RETURNS TABLE (
  shadow_snapshots bigint,
  offers_with_shadow bigint,
  offers_with_human_outcome bigint,
  matched bigint,
  unknown_outcomes bigint,
  pending_outcomes bigint,
  snoozed_outcomes bigint,
  expired_outcomes bigint,
  approved_outcomes bigint,
  rejected_outcomes bigint,
  last_shadow_at timestamptz,
  last_human_at timestamptz,
  avg_time_to_decision_seconds numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE offer_id IS NOT NULL)::bigint,
    count(*) FILTER (WHERE human_outcome IN (
      'HUMAN_APPROVED', 'HUMAN_REJECTED', 'HUMAN_SNOOZED', 'HUMAN_EXPIRED'
    ))::bigint,
    count(*) FILTER (WHERE human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (WHERE human_outcome = 'UNKNOWN')::bigint,
    count(*) FILTER (WHERE human_outcome = 'HUMAN_PENDING')::bigint,
    count(*) FILTER (WHERE human_outcome = 'HUMAN_SNOOZED')::bigint,
    count(*) FILTER (WHERE human_outcome = 'HUMAN_EXPIRED')::bigint,
    count(*) FILTER (WHERE human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE human_outcome = 'HUMAN_REJECTED')::bigint,
    max(created_at),
    max(human_action_at),
    avg(EXTRACT(EPOCH FROM (human_action_at - created_at)))
      FILTER (WHERE human_action_at IS NOT NULL)
  FROM public.hunter_shadow_outcomes
  WHERE created_at >= p_since
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_collection(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_collection(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_by_decision(p_since timestamptz)
RETURNS TABLE (
  shadow_decision text,
  snapshots bigint,
  matched bigint,
  approved bigint,
  rejected bigint,
  pending bigint,
  unknown_outcomes bigint,
  snoozed bigint,
  expired bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.shadow_decision,
    count(*)::bigint,
    count(*) FILTER (WHERE o.human_outcome IN ('HUMAN_APPROVED', 'HUMAN_REJECTED'))::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_PENDING')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'UNKNOWN')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_SNOOZED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_EXPIRED')::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
  GROUP BY o.shadow_decision
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_by_decision(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_by_decision(timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_reason_outcomes(p_since timestamptz)
RETURNS TABLE (
  reason_code text,
  count bigint,
  approved bigint,
  rejected bigint,
  unknown_outcomes bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    x.reason_code,
    count(*)::bigint,
    count(*) FILTER (WHERE x.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE x.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE x.human_outcome = 'UNKNOWN')::bigint
  FROM (
    SELECT
      o.human_outcome,
      jsonb_array_elements_text(COALESCE(o.reason_codes, '[]'::jsonb)) AS reason_code
    FROM public.hunter_shadow_outcomes o
    WHERE o.created_at >= p_since
  ) x
  WHERE x.reason_code IS NOT NULL
    AND length(x.reason_code) > 0
  GROUP BY x.reason_code
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_reason_outcomes(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_reason_outcomes(timestamptz) TO service_role;

DROP FUNCTION IF EXISTS public.hunter_shadow_calibration_by_source(timestamptz);

CREATE OR REPLACE FUNCTION public.hunter_shadow_calibration_by_source(p_since timestamptz)
RETURNS TABLE (
  source_id text,
  source_family text,
  source_lane text,
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
  human_review_rejected bigint,
  approved bigint,
  rejected bigint,
  pending bigint,
  snoozed bigint,
  expired bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    o.source_id,
    o.source_family,
    CASE WHEN o.source_family = 'community' THEN 'community' ELSE 'machine' END,
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
    count(*) FILTER (WHERE o.shadow_decision = 'HUMAN_REVIEW' AND o.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_APPROVED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_REJECTED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_PENDING')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_SNOOZED')::bigint,
    count(*) FILTER (WHERE o.human_outcome = 'HUMAN_EXPIRED')::bigint
  FROM public.hunter_shadow_outcomes o
  WHERE o.created_at >= p_since
  GROUP BY o.source_id, o.source_family
$$;

REVOKE ALL ON FUNCTION public.hunter_shadow_calibration_by_source(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hunter_shadow_calibration_by_source(timestamptz) TO service_role;
