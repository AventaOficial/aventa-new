-- Moderation Outcomes — append-only observability for human decisions.
-- Does NOT auto-approve. Does NOT change Evidence/DQE/thresholds.
-- moderation_logs remains the legacy action log; hunter_shadow_outcomes remains shadow calibration.
-- Apply via Supabase SQL editor / MCP. Service role only for writes from Next server.

CREATE TABLE IF NOT EXISTS public.moderation_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  decision text NOT NULL
    CHECK (decision IN ('claim', 'approve', 'reject', 'snooze')),
  moderator_id uuid NOT NULL,
  decision_at timestamptz NOT NULL DEFAULT now(),
  offer_submitted_at timestamptz NULL,
  time_from_submission_ms bigint NULL
    CHECK (time_from_submission_ms IS NULL OR time_from_submission_ms >= 0),
  priority_at_decision text NULL
    CHECK (
      priority_at_decision IS NULL
      OR priority_at_decision IN (
        'P1_HIGH_VALUE',
        'P2_REVIEW',
        'P3_INSUFFICIENT_EVIDENCE',
        'P4_LOW_VALUE'
      )
    ),
  source text NULL,
  source_lane text NOT NULL DEFAULT 'unknown'
    CHECK (source_lane IN ('community', 'machine', 'unknown')),
  quality_classification text NULL,
  evidence_classification text NULL,
  is_duplicate boolean NULL,
  artificial_discount boolean NULL,
  affiliate_ready boolean NULL,
  rejection_reason text NULL,
  snooze_minutes integer NULL
    CHECK (snooze_minutes IS NULL OR snooze_minutes > 0),
  idempotency_key text NOT NULL,
  contract_version integer NOT NULL DEFAULT 1
    CHECK (contract_version >= 1),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moderation_outcomes_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_decision_at
  ON public.moderation_outcomes (decision_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_offer_id
  ON public.moderation_outcomes (offer_id);

CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_decision_at_decision
  ON public.moderation_outcomes (decision, decision_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_priority
  ON public.moderation_outcomes (priority_at_decision, decision_at DESC);

CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_source
  ON public.moderation_outcomes (source, source_lane, decision_at DESC);

COMMENT ON TABLE public.moderation_outcomes IS
  'Append-only human moderation outcomes (claim/approve/reject/snooze). Observability only; never drives auto-approve.';

COMMENT ON COLUMN public.moderation_outcomes.idempotency_key IS
  'Stable key: approve|reject:{offer_id}; snooze/claim include time facets. ON CONFLICT = idempotent.';

COMMENT ON COLUMN public.moderation_outcomes.priority_at_decision IS
  'Snapshot of evaluateModerationPriority at decision time. Does not change quality engines.';

ALTER TABLE public.moderation_outcomes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moderation_outcomes FROM PUBLIC;
REVOKE ALL ON TABLE public.moderation_outcomes FROM anon;
REVOKE ALL ON TABLE public.moderation_outcomes FROM authenticated;
GRANT ALL ON TABLE public.moderation_outcomes TO service_role;

-- Staff may SELECT for owner/admin dashboards via user JWT (optional).
-- Writes remain service_role only (Next createServerClient) — no client inserts.
GRANT SELECT ON TABLE public.moderation_outcomes TO authenticated;

DROP POLICY IF EXISTS moderation_outcomes_select_staff ON public.moderation_outcomes;
CREATE POLICY moderation_outcomes_select_staff
  ON public.moderation_outcomes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated → fail-closed for clients.
