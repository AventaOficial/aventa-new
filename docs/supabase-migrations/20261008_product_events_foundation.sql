-- Product event foundation (V1.1 phase 1).
-- Extends public.product_events. Does not recreate the table and does not remove existing columns or money tables.
-- Idempotent. Existing rows keep actor_class = ANONYMOUS (the column default).
-- That one-time default is not a reclassifier: nothing updates actor_class later.
-- event_name CHECK is NOT VALID so an unknown historical name does not abort the migration.
-- New inserts are still rejected when the name is outside the allowlist.

CREATE TABLE IF NOT EXISTS public.product_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  anonymous_id text,
  offer_id uuid,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key text
);

ALTER TABLE public.product_events
  ADD COLUMN IF NOT EXISTS actor_class text NOT NULL DEFAULT 'ANONYMOUS',
  ADD COLUMN IF NOT EXISTS event_version smallint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_events_actor_class_check'
      AND conrelid = 'public.product_events'::regclass
  ) THEN
    ALTER TABLE public.product_events
      ADD CONSTRAINT product_events_actor_class_check
      CHECK (actor_class IN ('HUMAN', 'MACHINE_HUNTER', 'SYSTEM', 'ANONYMOUS'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_events_event_version_check'
      AND conrelid = 'public.product_events'::regclass
  ) THEN
    ALTER TABLE public.product_events
      ADD CONSTRAINT product_events_event_version_check
      CHECK (event_version >= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_events_event_name_check'
      AND conrelid = 'public.product_events'::regclass
  ) THEN
    ALTER TABLE public.product_events
      ADD CONSTRAINT product_events_event_name_check
      CHECK (event_name IN (
        'page_view',
        'feed_view',
        'search',
        'load_more',
        'offer_view',
        'offer_click',
        'outbound_click',
        'vote',
        'save',
        'comment',
        'submission',
        'signup',
        'login'
      )) NOT VALID;
  END IF;
END $$;

COMMENT ON COLUMN public.product_events.actor_class IS
  'Clase resuelta al insertar. Inmutable. Filas previas quedan ANONYMOUS y no se reclasifican si cambia el entorno.';

COMMENT ON COLUMN public.product_events.event_version IS
  'Versión del contrato de la fila. 1 es la fundación V1.1.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_events_dedupe
  ON public.product_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_name_time
  ON public.product_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_time
  ON public.product_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_anon_time
  ON public.product_events (anonymous_id, occurred_at DESC)
  WHERE anonymous_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_actor_name_time
  ON public.product_events (actor_class, event_name, occurred_at DESC);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.product_events TO service_role;
