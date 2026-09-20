-- Hunter Candidate Intelligence — persistent candidate ledger (SHADOW / OBSERVATION).
-- Additive. Does NOT mint offers. Does NOT touch money path / rewards / payouts.
-- Staging-first. Apply via Supabase SQL Editor / CLI. service_role only.
--
-- Separates DISCOVERY (this ledger) from PUBLICATION (offers.pending → approved).

CREATE TABLE IF NOT EXISTS public.hunter_offer_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id text NOT NULL,
  candidate_key text NOT NULL,
  source text NOT NULL,
  retailer text NULL,
  source_url text NOT NULL,
  canonical_url text NOT NULL,
  title text NULL,
  description text NULL,
  image_url text NULL,
  seller text NULL,
  brand text NULL,
  category text NULL,
  subcategory text NULL,
  original_price numeric(12, 2) NULL,
  sale_price numeric(12, 2) NULL,
  discount_percentage integer NULL,
  coupon text NULL,
  shipping_cost numeric(12, 2) NULL,
  currency text NOT NULL DEFAULT 'MXN',
  availability text NULL,
  seller_rating numeric(8, 4) NULL,
  product_rating numeric(8, 4) NULL,
  review_count integer NULL,
  product_fingerprint text NULL,
  duplicate_of text NULL,
  duplicate_cluster_id text NULL,
  hunter_score numeric(8, 2) NULL,
  score_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_explanation jsonb NOT NULL DEFAULT '[]'::jsonb,
  dqe_qualification text NULL,
  machine_quality_decision text NULL,
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  decision text NOT NULL,
  reason_code text NOT NULL,
  reason_detail text NULL,
  rejection_stage text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  negative_memory_level text NULL,
  inserted_offer_id uuid NULL,
  affiliate_status text NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  hunter_version text NOT NULL,
  normalization_version text NOT NULL,
  scoring_version text NOT NULL,
  decision_policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hunter_offer_candidates_decision_chk CHECK (
    decision IN (
      'DISCOVERED',
      'NORMALIZED',
      'ENRICHED',
      'DUPLICATE',
      'REJECTED_LOW_VALUE',
      'REJECTED_PRICE',
      'REJECTED_DISCOUNT',
      'REJECTED_SELLER',
      'REJECTED_PRODUCT',
      'REJECTED_SOURCE',
      'REJECTED_EXPIRED',
      'REJECTED_UNAVAILABLE',
      'REJECTED_NOT_MONETIZABLE',
      'REJECTED_NEGATIVE_MEMORY',
      'REJECTED_POLICY',
      'REJECTED_BUDGET',
      'NEEDS_REVIEW',
      'WATCHLIST',
      'WOULD_INSERT',
      'INSERTED_PENDING',
      'PUBLISHED',
      'FAILED'
    )
  ),
  CONSTRAINT hunter_offer_candidates_run_key_uidx UNIQUE (run_id, candidate_key)
);

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_run_idx
  ON public.hunter_offer_candidates (run_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS hunter_offer_candidates_decision_idx
  ON public.hunter_offer_candidates (decision, discovered_at DESC);
CREATE INDEX IF NOT EXISTS hunter_offer_candidates_fp_idx
  ON public.hunter_offer_candidates (product_fingerprint)
  WHERE product_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS hunter_offer_candidates_canonical_idx
  ON public.hunter_offer_candidates (canonical_url);

COMMENT ON TABLE public.hunter_offer_candidates IS
  'Candidate Intelligence ledger: every analyzed Hunter candidate with disposition. Shadow/observation — not publication.';

-- Human labels (false positive / false negative / review actions)
CREATE TABLE IF NOT EXISTS public.hunter_candidate_human_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL
    REFERENCES public.hunter_offer_candidates (id) ON DELETE CASCADE,
  hunter_decision text NOT NULL,
  human_decision text NOT NULL
    CHECK (human_decision IN (
      'PUBLISH',
      'REJECT',
      'WATCH',
      'DUPLICATE',
      'REVIEW',
      'FALSE_NEGATIVE',
      'FALSE_POSITIVE',
      'GREAT_DEAL',
      'FALSE_DEAL',
      'COUPON',
      'PRICE_ERROR',
      'LOW_VALUE',
      'OTHER'
    )),
  reason_code text NULL,
  reason_detail text NULL,
  reviewer text NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  label_schema_version text NOT NULL DEFAULT 'hunter_label_v1',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hunter_candidate_human_labels_candidate_idx
  ON public.hunter_candidate_human_labels (candidate_id, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS hunter_candidate_human_labels_human_idx
  ON public.hunter_candidate_human_labels (human_decision, reviewed_at DESC);

COMMENT ON TABLE public.hunter_candidate_human_labels IS
  'Human review labels over Hunter candidates for false-negative/positive dataset. Append-friendly.';

-- Per-run funnel report (aggregates; candidates hold row-level truth)
CREATE TABLE IF NOT EXISTS public.hunter_intelligence_runs (
  run_id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL,
  mode text NOT NULL DEFAULT 'observation',
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  retailers jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_count integer NOT NULL DEFAULT 0,
  normalized_count integer NOT NULL DEFAULT 0,
  duplicate_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  needs_review_count integer NOT NULL DEFAULT 0,
  would_insert_count integer NOT NULL DEFAULT 0,
  inserted_pending_count integer NOT NULL DEFAULT 0,
  published_count integer NOT NULL DEFAULT 0,
  rejection_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_distribution jsonb NOT NULL DEFAULT '{}'::jsonb,
  hunter_version text NOT NULL,
  scoring_version text NOT NULL,
  decision_policy_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hunter_intelligence_runs IS
  'Hunter Run Report aggregates for Candidate Intelligence. Observation mode default.';

ALTER TABLE public.hunter_offer_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunter_candidate_human_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hunter_intelligence_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.hunter_offer_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hunter_candidate_human_labels FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hunter_intelligence_runs FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.hunter_offer_candidates TO service_role;
GRANT ALL ON TABLE public.hunter_candidate_human_labels TO service_role;
GRANT ALL ON TABLE public.hunter_intelligence_runs TO service_role;
