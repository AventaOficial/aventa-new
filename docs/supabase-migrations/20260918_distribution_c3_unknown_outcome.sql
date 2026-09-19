-- Distribution C3 — UNKNOWN_OUTCOME + reclaim safety + observability events.
-- Structurally required: CHECK constraints cannot store unknown_outcome without this.
-- Does NOT enable DISTRIBUTION_ENGINE_ENABLED. No provider calls. No money/Supply.
-- Apply ONLY on staging (oojshofrpbfwsiypcecr). Never apply to production in C3 campaign.
--
-- Rollback (staging): restore prior CHECKs without unknown_outcome / C3 event types,
-- then UPDATE any unknown_outcome rows to failed before dropping the status value.
-- Index idx_distribution_publications_publishing_lease may be DROPped safely.

-- ---------------------------------------------------------------------------
-- Status: add unknown_outcome (≠ retryable; no automatic external republish)
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribution_publications
  DROP CONSTRAINT IF EXISTS distribution_publications_status_check;

ALTER TABLE public.distribution_publications
  ADD CONSTRAINT distribution_publications_status_check
  CHECK (status IN (
    'pending',
    'publishing',
    'published',
    'retryable',
    'failed',
    'cancelled',
    'unknown_outcome'
  ));

COMMENT ON COLUMN public.distribution_publications.status IS
  'pending→publishing→published | retryable→publishing | unknown_outcome (ambiguous side effect; no auto-retry) | failed | cancelled. Lease ≈ updated_at while publishing.';

-- ---------------------------------------------------------------------------
-- Events: C1 retained + C3 observability (semantic names) + WIP aliases
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribution_events
  DROP CONSTRAINT IF EXISTS distribution_events_event_type_check;

ALTER TABLE public.distribution_events
  ADD CONSTRAINT distribution_events_event_type_check
  CHECK (event_type IN (
    -- C1
    'publication_created',
    'publication_attempted',
    'publication_published',
    'publication_failed',
    'publication_retryable',
    -- C3 semantic observability (required contract)
    'lease_acquired',
    'lease_expired',
    'reclaim_attempted',
    'reclaimed',
    'unknown_outcome',
    'released_to_retryable',
    'publish_success',
    'publish_failure',
    -- Early WIP aliases (compat)
    'publication_unknown_outcome',
    'publication_reclaimed'
  ));

-- ---------------------------------------------------------------------------
-- Reclaim scan: stuck publishing by lease (updated_at)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_distribution_publications_publishing_lease
  ON public.distribution_publications (updated_at)
  WHERE status = 'publishing';
