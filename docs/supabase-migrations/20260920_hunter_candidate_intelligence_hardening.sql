-- Hunter Candidate Intelligence — ledger hardening (additive).
-- Image / URL observability columns. Does NOT mint offers.
-- Staging-first. service_role only (tables already RLS-locked).

ALTER TABLE public.hunter_offer_candidates
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS affiliate_url text,
  ADD COLUMN IF NOT EXISTS title_raw text,
  ADD COLUMN IF NOT EXISTS title_normalized text,
  ADD COLUMN IF NOT EXISTS image_url_original text,
  ADD COLUMN IF NOT EXISTS image_url_resolved text,
  ADD COLUMN IF NOT EXISTS image_http_status integer,
  ADD COLUMN IF NOT EXISTS image_content_type text,
  ADD COLUMN IF NOT EXISTS image_validation_status text,
  ADD COLUMN IF NOT EXISTS image_validation_reason text,
  ADD COLUMN IF NOT EXISTS product_identifier text,
  ADD COLUMN IF NOT EXISTS url_diagnosis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS diversity_cut boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negative_memory_match text;

-- Extend decision taxonomy (reuse + explicit image/diversity/identity)
ALTER TABLE public.hunter_offer_candidates
  DROP CONSTRAINT IF EXISTS hunter_offer_candidates_decision_chk;

ALTER TABLE public.hunter_offer_candidates
  ADD CONSTRAINT hunter_offer_candidates_decision_chk CHECK (
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
      'REJECTED_IMAGE',
      'REJECTED_DIVERSITY',
      'REJECTED_IDENTITY',
      'REJECTED_URL',
      'REJECTED_DQE',
      'REJECTED_SCORE',
      'REJECTED_WRITE_GATE',
      'NEEDS_REVIEW',
      'WATCHLIST',
      'WOULD_INSERT',
      'INSERTED_PENDING',
      'PUBLISHED',
      'FAILED'
    )
  );

-- Expand human label actions for Hunter Lab review
ALTER TABLE public.hunter_candidate_human_labels
  DROP CONSTRAINT IF EXISTS hunter_candidate_human_labels_human_decision_check;

ALTER TABLE public.hunter_candidate_human_labels
  ADD CONSTRAINT hunter_candidate_human_labels_human_decision_check CHECK (
    human_decision IN (
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
      'GOOD_DEAL',
      'BAD_DEAL',
      'WRONG_IMAGE',
      'BROKEN_LINK',
      'BAD_PRICE',
      'BAD_DISCOUNT',
      'OTHER'
    )
  );

COMMENT ON COLUMN public.hunter_offer_candidates.image_validation_status IS
  'Deterministic image validation status (ok|missing|junk|…). Observation only.';
COMMENT ON COLUMN public.hunter_offer_candidates.url_diagnosis IS
  'diagnoseOfferUrl snapshot without secrets/tokens.';
