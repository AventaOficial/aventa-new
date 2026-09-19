-- Distribution C3 — UNKNOWN_OUTCOME + reclaim safety.
-- Structurally required: CHECK constraints cannot store unknown_outcome without this.
-- Does NOT enable DISTRIBUTION_ENGINE_ENABLED. No provider calls. No money/Supply.

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
-- Events: reclaim + unknown_outcome observability
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribution_events
  DROP CONSTRAINT IF EXISTS distribution_events_event_type_check;

ALTER TABLE public.distribution_events
  ADD CONSTRAINT distribution_events_event_type_check
  CHECK (event_type IN (
    'publication_created',
    'publication_attempted',
    'publication_published',
    'publication_failed',
    'publication_retryable',
    'publication_unknown_outcome',
    'publication_reclaimed'
  ));

-- ---------------------------------------------------------------------------
-- Reclaim scan: stuck publishing by lease (updated_at)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_distribution_publications_publishing_lease
  ON public.distribution_publications (updated_at)
  WHERE status = 'publishing';
