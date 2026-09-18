-- Distribution Engine P0-D1 — domain foundation (provider-agnostic).
-- Does NOT call Telegram/WhatsApp. Does NOT write money/Supply/attribution.
-- Does NOT approve offers. Publications reference existing offers only.
-- Apply via Supabase SQL editor / MCP. Writes: service_role only.

-- ---------------------------------------------------------------------------
-- Brands (multi-brand surfaces; destinations belong to one brand)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribution_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_brands_slug_unique UNIQUE (slug),
  CONSTRAINT distribution_brands_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);

COMMENT ON TABLE public.distribution_brands IS
  'Distribution brand umbrella. One brand → N destinations. Never clones offers.';

-- ---------------------------------------------------------------------------
-- Destinations (external publishing surfaces)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribution_destinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES public.distribution_brands(id) ON DELETE RESTRICT,
  provider text NOT NULL
    CHECK (provider IN ('telegram', 'whatsapp', 'web')),
  slug text NOT NULL,
  display_name text NOT NULL,
  -- Provider-agnostic external id (Telegram chat_id, future WA id, etc.)
  external_destination_key text NOT NULL,
  -- Env/secret name only — NEVER store bot tokens here
  credential_ref text NULL,
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('active', 'paused', 'disabled')),
  -- Routing config (configuration-driven; no hardcoded destination ids in code)
  -- general: eligible for every distributable offer
  -- category: eligible when offer.category ∈ category_ids
  -- coupons: eligible when offer has coupon/bank_coupon signal
  kind text NOT NULL
    CHECK (kind IN ('general', 'category', 'coupons')),
  category_ids text[] NOT NULL DEFAULT '{}'::text[],
  tracking_campaign_key text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT distribution_destinations_slug_unique UNIQUE (slug),
  CONSTRAINT distribution_destinations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT distribution_destinations_provider_ext_unique
    UNIQUE (provider, external_destination_key),
  CONSTRAINT distribution_destinations_category_kind_check CHECK (
    (kind = 'category' AND cardinality(category_ids) > 0)
    OR (kind <> 'category')
  ),
  CONSTRAINT distribution_destinations_campaign_format CHECK (
    tracking_campaign_key IS NULL
    OR tracking_campaign_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_distribution_destinations_brand_status
  ON public.distribution_destinations (brand_id, status);

CREATE INDEX IF NOT EXISTS idx_distribution_destinations_active_kind
  ON public.distribution_destinations (kind)
  WHERE status = 'active';

COMMENT ON TABLE public.distribution_destinations IS
  'External distribution surfaces. Provider-agnostic; Telegram adapter comes later.';
COMMENT ON COLUMN public.distribution_destinations.credential_ref IS
  'Secret/env key name only. Never persist provider tokens in this table.';
COMMENT ON COLUMN public.distribution_destinations.external_destination_key IS
  'Opaque external chat/channel id for the provider. Not an offer URL.';

-- ---------------------------------------------------------------------------
-- Publications (1 offer × N destinations; SoT of distribution work)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribution_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  destination_id uuid NOT NULL REFERENCES public.distribution_destinations(id) ON DELETE RESTRICT,
  distribution_version integer NOT NULL DEFAULT 1
    CHECK (distribution_version >= 1),
  -- Deterministic: offer_id:destination_id:v{version}
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'publishing',
      'published',
      'retryable',
      'failed',
      'cancelled'
    )),
  -- Denormalized from destination at enqueue (query/drain without join)
  provider text NOT NULL
    CHECK (provider IN ('telegram', 'whatsapp', 'web')),
  external_message_id text NULL,
  external_destination_key text NULL,
  tracking_campaign_key text NULL,
  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz NULL,
  CONSTRAINT distribution_publications_idempotency_unique UNIQUE (idempotency_key),
  CONSTRAINT distribution_publications_offer_dest_version_unique
    UNIQUE (offer_id, destination_id, distribution_version),
  CONSTRAINT distribution_publications_campaign_format CHECK (
    tracking_campaign_key IS NULL
    OR tracking_campaign_key ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  )
);

CREATE INDEX IF NOT EXISTS idx_distribution_publications_offer
  ON public.distribution_publications (offer_id);

CREATE INDEX IF NOT EXISTS idx_distribution_publications_destination
  ON public.distribution_publications (destination_id);

CREATE INDEX IF NOT EXISTS idx_distribution_publications_drain
  ON public.distribution_publications (status, next_attempt_at NULLS FIRST, created_at)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX IF NOT EXISTS idx_distribution_publications_status_created
  ON public.distribution_publications (status, created_at DESC);

COMMENT ON TABLE public.distribution_publications IS
  'Fan-out work items: one row per offer×destination×version. Never clones offers. Not conversions.';
COMMENT ON COLUMN public.distribution_publications.idempotency_key IS
  'Authoritative duplicate guard alongside UNIQUE(offer_id, destination_id, distribution_version).';
COMMENT ON COLUMN public.distribution_publications.status IS
  'pending→publishing→published | retryable→publishing | failed | cancelled. No provider calls in P0-D1.';

-- ---------------------------------------------------------------------------
-- Events (append-only distribution observability — NOT offer_events / attribution)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.distribution_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.distribution_publications(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'publication_created',
      'publication_attempted',
      'publication_published',
      'publication_failed',
      'publication_retryable'
    )),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_distribution_events_publication_created
  ON public.distribution_events (publication_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_distribution_events_type_created
  ON public.distribution_events (event_type, created_at DESC);

COMMENT ON TABLE public.distribution_events IS
  'Append-only distribution lifecycle events. Not attribution. Not offer_events. No fake views/clicks/conversions.';

-- ---------------------------------------------------------------------------
-- RLS — service_role writes; staff SELECT optional
-- ---------------------------------------------------------------------------
ALTER TABLE public.distribution_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.distribution_brands FROM PUBLIC;
REVOKE ALL ON TABLE public.distribution_brands FROM anon;
REVOKE ALL ON TABLE public.distribution_brands FROM authenticated;
GRANT ALL ON TABLE public.distribution_brands TO service_role;

REVOKE ALL ON TABLE public.distribution_destinations FROM PUBLIC;
REVOKE ALL ON TABLE public.distribution_destinations FROM anon;
REVOKE ALL ON TABLE public.distribution_destinations FROM authenticated;
GRANT ALL ON TABLE public.distribution_destinations TO service_role;

REVOKE ALL ON TABLE public.distribution_publications FROM PUBLIC;
REVOKE ALL ON TABLE public.distribution_publications FROM anon;
REVOKE ALL ON TABLE public.distribution_publications FROM authenticated;
GRANT ALL ON TABLE public.distribution_publications TO service_role;

REVOKE ALL ON TABLE public.distribution_events FROM PUBLIC;
REVOKE ALL ON TABLE public.distribution_events FROM anon;
REVOKE ALL ON TABLE public.distribution_events FROM authenticated;
GRANT ALL ON TABLE public.distribution_events TO service_role;

GRANT SELECT ON TABLE public.distribution_brands TO authenticated;
GRANT SELECT ON TABLE public.distribution_destinations TO authenticated;
GRANT SELECT ON TABLE public.distribution_publications TO authenticated;
GRANT SELECT ON TABLE public.distribution_events TO authenticated;

DROP POLICY IF EXISTS distribution_brands_select_staff ON public.distribution_brands;
CREATE POLICY distribution_brands_select_staff
  ON public.distribution_brands
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS distribution_destinations_select_staff ON public.distribution_destinations;
CREATE POLICY distribution_destinations_select_staff
  ON public.distribution_destinations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS distribution_publications_select_staff ON public.distribution_publications;
CREATE POLICY distribution_publications_select_staff
  ON public.distribution_publications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS distribution_events_select_staff ON public.distribution_events;
CREATE POLICY distribution_events_select_staff
  ON public.distribution_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

-- No INSERT/UPDATE/DELETE policies for authenticated → fail-closed for clients.
