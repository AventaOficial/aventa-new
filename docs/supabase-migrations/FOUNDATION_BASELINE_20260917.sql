-- FOUNDATION BASELINE 20260917
-- Source of truth: PRODUCTION schema mkgsrpsuvedwwlzmzmzh (Gate0 READ-ONLY catalog)
-- Companion: docs/SYSTEMS/FOUNDATION_DDL_SPEC.md / STAGING_SCHEMA_FORENSIC_DIFF.md
--
-- STATUS: AUTHORED ONLY — DO NOT APPLY until founder approval.
-- Target when approved: STAGING oojshofrpbfwsiypcecr ONLY (never silent prod apply).
--
-- IDEMPOTENCY: CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE POLICY.
-- CONFLICT GUARDS: aborts if staging-incompatible relations exist (views named offers/user_roles,
-- or legacy profiles without canonical columns). Does NOT DROP/ALTER legacy silently.
--
-- EXCLUDED (domain / money / supply / distribution): see footer TODO.
-- NOT VALID prod CHECKs omitted (offers_price_non_negative_check NOT VALID, etc.).
-- Triggers / vote counter functions: TODO — not fully reconstructed here (UNKNOWN completeness).

BEGIN;

-- ---------------------------------------------------------------------------
-- 0) Conflict preflight (staging-aware)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  offers_kind "char";
  roles_kind "char";
  has_display_name boolean;
BEGIN
  SELECT c.relkind INTO offers_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'offers';

  IF offers_kind = 'v' THEN
    RAISE EXCEPTION 'GATE0 CONFLICT: public.offers exists as VIEW (legacy over ofertas). Rename/drop view before creating canonical TABLE. No DROP performed.';
  END IF;

  SELECT c.relkind INTO roles_kind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'user_roles';

  IF roles_kind = 'v' THEN
    RAISE EXCEPTION 'GATE0 CONFLICT: public.user_roles exists as VIEW (legacy over profiles.role). Rename/drop view before creating canonical TABLE. No DROP performed.';
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'display_name'
    ) INTO has_display_name;
    IF NOT has_display_name THEN
      RAISE EXCEPTION 'GATE0 CONFLICT: public.profiles exists but lacks canonical column display_name (legacy shape). Do not CREATE IF NOT EXISTS over incompatible table. Manual reconcile required. No ALTER performed.';
    END IF;
  END IF;
END $$;

-- === profiles (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid NOT NULL,
  username text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  display_name text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  offers_submitted_count integer NOT NULL DEFAULT 0,
  offers_approved_count integer NOT NULL DEFAULT 0,
  offers_rejected_count integer NOT NULL DEFAULT 0,
  display_name_updated_at timestamptz DEFAULT now(),
  reputation_score integer NOT NULL DEFAULT 0,
  reputation_level integer NOT NULL DEFAULT 1,
  is_trusted boolean NOT NULL DEFAULT false,
  slug text,
  leader_badge text,
  ml_tracking_tag text,
  preferred_categories text[] DEFAULT '{}'::text[],
  vote_weight_multiplier integer NOT NULL DEFAULT 1,
  commissions_accepted_at timestamptz,
  commissions_terms_version text,
  name_saved_in_settings_at timestamptz,
  owner_auto_approve_offers boolean NOT NULL DEFAULT false,
  owner_auto_approve_offers_at timestamptz,
  owner_auto_approve_offers_by uuid,
  commission_legal_name text,
  commission_rfc text,
  commission_clabe text,
  commission_fiscal_updated_at timestamptz,
  amazon_tracking_tag text,
  reward_program_unlocked_at timestamptz,
  welcome_offer_id uuid,
  welcome_offer_selected_at timestamptz,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  legal_consent_version text,
  account_deletion_requested_at timestamptz,
  rewards_terms_accepted_at timestamptz,
  rewards_terms_version text,
  PRIMARY KEY (id),
  UNIQUE (username),
  CHECK (((leader_badge IS NULL) OR (leader_badge = ANY (ARRAY['cazador_estrella'::text, 'cazador_aventa'::text])))),
  CHECK (((vote_weight_multiplier >= 1) AND (vote_weight_multiplier <= 1000)))
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- === user_roles (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text])))
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

-- === offers (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  price numeric NOT NULL,
  original_price numeric,
  image_url text NOT NULL,
  store text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'approved'::text,
  created_by uuid,
  is_featured boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  rejection_reason text,
  offer_url text,
  description text,
  votes_count integer NOT NULL DEFAULT 0,
  outbound_24h integer NOT NULL DEFAULT 0,
  ctr_24h numeric NOT NULL DEFAULT 0,
  ranking_momentum numeric NOT NULL DEFAULT 0,
  upvotes_count integer NOT NULL DEFAULT 0,
  downvotes_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  risk_score integer,
  steps text,
  conditions text,
  coupons text,
  msi_months integer,
  image_urls text[] DEFAULT '{}'::text[],
  deleted_at timestamptz,
  reputation_weighted_score numeric,
  category text,
  moderator_comment text,
  bank_coupon text,
  tags text[] DEFAULT '{}'::text[],
  link_mod_ok boolean,
  locked_by uuid,
  locked_at timestamptz,
  snoozed_until timestamptz,
  bot_meta jsonb,
  product_fingerprint text,
  original_offer_url text,
  PRIMARY KEY (id),
  CHECK (((bank_coupon IS NULL) OR (bank_coupon = ANY (ARRAY['bbva'::text, 'banamex'::text, 'santander'::text, 'hsbc'::text, 'banorte'::text, 'scotiabank'::text, 'inbursa'::text, 'nu'::text, 'rappi-card'::text, 'otro'::text])))),
  CHECK (((msi_months IS NULL) OR ((msi_months >= 1) AND (msi_months <= 24)))),
  CHECK (((risk_score IS NULL) OR ((risk_score >= 0) AND (risk_score <= 100))))
);

ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

-- === offer_votes (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.offer_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  value integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  vote smallint GENERATED ALWAYS AS (value) STORED,
  PRIMARY KEY (id),
  UNIQUE (offer_id, user_id),
  CHECK ((value = ANY (ARRAY[2, 4, 8, 12, '-1'::integer, '-2'::integer, '-4'::integer, '-6'::integer])))
);

ALTER TABLE public.offer_votes ENABLE ROW LEVEL SECURITY;

-- === offer_events (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.offer_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((event_type = ANY (ARRAY['view'::text, 'outbound'::text, 'share'::text, 'cazar_cta'::text])))
);

ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

-- === offer_favorites (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.offer_favorites (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  offer_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (user_id, offer_id)
);

ALTER TABLE public.offer_favorites ENABLE ROW LEVEL SECURITY;

-- === comments (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content varchar(280) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'::text,
  parent_id uuid,
  image_url text,
  PRIMARY KEY (id),
  CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- === comment_likes (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

-- === offer_reports (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.offer_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  reporter_id uuid,
  report_type text NOT NULL,
  comment text,
  status text DEFAULT 'pending'::text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((report_type = ANY (ARRAY['precio_falso'::text, 'no_es_oferta'::text, 'expirada'::text, 'spam'::text, 'afiliado_oculto'::text, 'otro'::text]))),
  CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'dismissed'::text])))
);

ALTER TABLE public.offer_reports ENABLE ROW LEVEL SECURITY;

-- === moderation_logs (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid,
  user_id uuid,
  action text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- === moderation_outcomes (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.moderation_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  decision text NOT NULL,
  moderator_id uuid NOT NULL,
  decision_at timestamptz NOT NULL DEFAULT now(),
  offer_submitted_at timestamptz,
  time_from_submission_ms bigint,
  priority_at_decision text,
  source text,
  source_lane text NOT NULL DEFAULT 'unknown'::text,
  quality_classification text,
  evidence_classification text,
  is_duplicate boolean,
  artificial_discount boolean,
  affiliate_ready boolean,
  rejection_reason text,
  snooze_minutes integer,
  idempotency_key text NOT NULL,
  contract_version integer NOT NULL DEFAULT 1,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (idempotency_key),
  CHECK ((decision = ANY (ARRAY['claim'::text, 'approve'::text, 'reject'::text, 'snooze'::text]))),
  CHECK ((contract_version >= 1)),
  CHECK ((source_lane = ANY (ARRAY['community'::text, 'machine'::text, 'unknown'::text]))),
  CHECK (((snooze_minutes IS NULL) OR (snooze_minutes > 0))),
  CHECK (((time_from_submission_ms IS NULL) OR (time_from_submission_ms >= 0))),
  CHECK (((priority_at_decision IS NULL) OR (priority_at_decision = ANY (ARRAY['P1_HIGH_VALUE'::text, 'P2_REVIEW'::text, 'P3_INSUFFICIENT_EVIDENCE'::text, 'P4_LOW_VALUE'::text]))))
);

ALTER TABLE public.moderation_outcomes ENABLE ROW LEVEL SECURITY;

-- === user_bans (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.user_bans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  banned_by uuid NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (user_id)
);

ALTER TABLE public.user_bans ENABLE ROW LEVEL SECURITY;

-- === notifications (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- === user_email_preferences (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  user_id uuid NOT NULL,
  email text,
  email_daily_digest boolean NOT NULL DEFAULT false,
  email_weekly_digest boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

-- === write_jobs_queue (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.write_jobs_queue (
  id bigserial PRIMARY KEY,
  job_type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  locked_at timestamptz,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'done'::text, 'failed'::text])))
);

ALTER TABLE public.write_jobs_queue ENABLE ROW LEVEL SECURITY;

-- === app_config (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.app_config (
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT 'false'::jsonb,
  PRIMARY KEY (key)
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- === announcements (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text,
  link text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  PRIMARY KEY (id)
);

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- === plaza_requests (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.plaza_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  details text,
  budget_max numeric,
  preferred_store text,
  status text NOT NULL DEFAULT 'approved'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'closed'::text])))
);

ALTER TABLE public.plaza_requests ENABLE ROW LEVEL SECURITY;

-- === plaza_discussions (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.plaza_discussions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'approved'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'hidden'::text])))
);

ALTER TABLE public.plaza_discussions ENABLE ROW LEVEL SECURITY;

-- === user_activity (from production mkgsrpsuvedwwlzmzmzh) ===
CREATE TABLE IF NOT EXISTS public.user_activity (
  user_id uuid NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id)
);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offers ADD CONSTRAINT offers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offers ADD CONSTRAINT offers_locked_by_fkey FOREIGN KEY (locked_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_welcome_offer_id_fkey FOREIGN KEY (welcome_offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_owner_auto_approve_offers_by_fkey FOREIGN KEY (owner_auto_approve_offers_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_votes ADD CONSTRAINT offer_votes_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_votes ADD CONSTRAINT offer_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_events ADD CONSTRAINT offer_events_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_events ADD CONSTRAINT offer_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_favorites ADD CONSTRAINT offer_favorites_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_favorites ADD CONSTRAINT offer_favorites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.comments ADD CONSTRAINT comments_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.comments ADD CONSTRAINT comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.comments ADD CONSTRAINT comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.comments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.comments(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.comment_likes ADD CONSTRAINT comment_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_reports ADD CONSTRAINT offer_reports_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.offer_reports ADD CONSTRAINT offer_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.moderation_logs ADD CONSTRAINT moderation_logs_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.moderation_logs ADD CONSTRAINT moderation_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.moderation_outcomes ADD CONSTRAINT moderation_outcomes_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.user_bans ADD CONSTRAINT user_bans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.user_bans ADD CONSTRAINT user_bans_banned_by_fkey FOREIGN KEY (banned_by) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.user_email_preferences ADD CONSTRAINT user_email_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.announcements ADD CONSTRAINT announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.plaza_requests ADD CONSTRAINT plaza_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.plaza_discussions ADD CONSTRAINT plaza_discussions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.user_activity ADD CONSTRAINT user_activity_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes (subset evidenced on prod; additional prod indexes may exist)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role);
CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON public.offers (created_at);
CREATE INDEX IF NOT EXISTS idx_offers_created_by ON public.offers (created_by);
CREATE INDEX IF NOT EXISTS idx_offers_status_created_at ON public.offers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON public.offers (expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_deleted_at ON public.offers (deleted_at) WHERE (deleted_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_offers_pending_snooze ON public.offers (status, snoozed_until NULLS FIRST, created_at) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_active_product_fingerprint ON public.offers USING btree (product_fingerprint) WHERE ((product_fingerprint IS NOT NULL) AND (product_fingerprint ~ '^(amz|ml):'::text) AND (deleted_at IS NULL) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'published'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user ON public.offer_votes (offer_id, user_id);
CREATE INDEX IF NOT EXISTS idx_offer_votes_offer_id ON public.offer_votes (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_events_offer_id ON public.offer_events (offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_events_offer_event_created_at ON public.offer_events (offer_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_favorites_user_id ON public.offer_favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_comments_offer_id ON public.comments (offer_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_offer ON public.moderation_logs (offer_id);
CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_offer_id ON public.moderation_outcomes (offer_id);
CREATE INDEX IF NOT EXISTS idx_moderation_outcomes_decision_at ON public.moderation_outcomes (decision_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS moderation_outcomes_idempotency_unique ON public.moderation_outcomes (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_status_created ON public.write_jobs_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_write_jobs_queue_job_type_status ON public.write_jobs_queue (job_type, status);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_slug_key ON public.profiles (slug) WHERE ((slug IS NOT NULL) AND (slug <> ''::text));

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- Policies reconstructed from production pg_policies (Gate0 READ-ONLY).
-- DROP IF EXISTS then CREATE for idempotency on re-apply to empty/new names only.

DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS profiles_delete_own ON public.profiles;
CREATE POLICY profiles_delete_own ON public.profiles FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS offers_owner_read_own ON public.offers;
CREATE POLICY offers_owner_read_own ON public.offers FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS offers_select_public ON public.offers;
CREATE POLICY offers_select_public ON public.offers FOR SELECT TO anon, authenticated
  USING ((deleted_at IS NULL) AND (status = ANY (ARRAY['approved'::text, 'published'::text])) AND ((expires_at IS NULL) OR (expires_at > now())));

DROP POLICY IF EXISTS offers_select_staff ON public.offers;
CREATE POLICY offers_select_staff ON public.offers FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text])
  ));

DROP POLICY IF EXISTS offer_votes_select_own ON public.offer_votes;
CREATE POLICY offer_votes_select_own ON public.offer_votes FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- offer_events: RLS enabled on prod with 0 policies (service_role path). No client policies.

DROP POLICY IF EXISTS offer_favorites_select_own ON public.offer_favorites;
CREATE POLICY offer_favorites_select_own ON public.offer_favorites FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_favorites_insert_own ON public.offer_favorites;
CREATE POLICY offer_favorites_insert_own ON public.offer_favorites FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_favorites_delete_own ON public.offer_favorites;
CREATE POLICY offer_favorites_delete_own ON public.offer_favorites FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS comments_select_public ON public.comments;
CREATE POLICY comments_select_public ON public.comments FOR SELECT TO anon, authenticated
  USING ((status = 'approved'::text) OR (user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS comments_select_approved_on_visible_offer ON public.comments;
CREATE POLICY comments_select_approved_on_visible_offer ON public.comments FOR SELECT TO public
  USING ((status = 'approved'::text) AND (EXISTS (
    SELECT 1 FROM public.offers o
    WHERE o.id = comments.offer_id
      AND o.status = ANY (ARRAY['approved'::text, 'published'::text])
      AND ((o.expires_at IS NULL) OR (o.expires_at > now()))
  )));

DROP POLICY IF EXISTS comment_likes_select ON public.comment_likes;
CREATE POLICY comment_likes_select ON public.comment_likes FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS comment_likes_insert_own ON public.comment_likes;
CREATE POLICY comment_likes_insert_own ON public.comment_likes FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS comment_likes_delete_own ON public.comment_likes;
CREATE POLICY comment_likes_delete_own ON public.comment_likes FOR DELETE TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS offer_reports_select_own ON public.offer_reports;
CREATE POLICY offer_reports_select_own ON public.offer_reports FOR SELECT TO authenticated
  USING (reporter_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS offer_reports_select_staff ON public.offer_reports;
CREATE POLICY offer_reports_select_staff ON public.offer_reports FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS moderation_logs_select_staff ON public.moderation_logs;
CREATE POLICY moderation_logs_select_staff ON public.moderation_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS moderation_outcomes_select_staff ON public.moderation_outcomes;
CREATE POLICY moderation_outcomes_select_staff ON public.moderation_outcomes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS user_bans_select_admin ON public.user_bans;
CREATE POLICY user_bans_select_admin ON public.user_bans FOR SELECT TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_insert_admin ON public.user_bans;
CREATE POLICY user_bans_insert_admin ON public.user_bans FOR INSERT TO public
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_update_admin ON public.user_bans;
CREATE POLICY user_bans_update_admin ON public.user_bans FOR UPDATE TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));
DROP POLICY IF EXISTS user_bans_delete_admin ON public.user_bans;
CREATE POLICY user_bans_delete_admin ON public.user_bans FOR DELETE TO public
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
  ));

DROP POLICY IF EXISTS users_own_notifications ON public.notifications;
CREATE POLICY users_own_notifications ON public.notifications FOR ALL TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_email_prefs ON public.user_email_preferences;
CREATE POLICY users_own_email_prefs ON public.user_email_preferences FOR ALL TO public
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS announcements_select_active ON public.announcements;
CREATE POLICY announcements_select_active ON public.announcements FOR SELECT TO public
  USING (active = true);
DROP POLICY IF EXISTS announcements_all_service_role ON public.announcements;
CREATE POLICY announcements_all_service_role ON public.announcements FOR ALL TO public
  USING (auth.role() = 'service_role'::text);

DROP POLICY IF EXISTS plaza_requests_select_approved ON public.plaza_requests;
CREATE POLICY plaza_requests_select_approved ON public.plaza_requests FOR SELECT TO public
  USING ((status = 'approved'::text) OR (auth.uid() = user_id));
DROP POLICY IF EXISTS plaza_requests_insert_own ON public.plaza_requests;
CREATE POLICY plaza_requests_insert_own ON public.plaza_requests FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plaza_discussions_select_approved ON public.plaza_discussions;
CREATE POLICY plaza_discussions_select_approved ON public.plaza_discussions FOR SELECT TO public
  USING ((status = 'approved'::text) OR (auth.uid() = user_id));
DROP POLICY IF EXISTS plaza_discussions_insert_own ON public.plaza_discussions;
CREATE POLICY plaza_discussions_insert_own ON public.plaza_discussions FOR INSERT TO public
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_activity_own_upsert ON public.user_activity;
CREATE POLICY user_activity_own_upsert ON public.user_activity FOR ALL TO public
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- write_jobs_queue / app_config: RLS on; client policies UNKNOWN/none on prod for queue.

-- ---------------------------------------------------------------------------
-- Views (REQUIRED: public_profiles_view, ofertas_ranked_general; OPTIONAL: daily_system_metrics)
-- WARNING: CREATE OR REPLACE VIEW will fail if staging has incompatible view named ofertas_ranked_general (none today).
-- WARNING: staging has VIEW public.offers — blocked by preflight above.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.public_profiles_view AS
 SELECT id,
    display_name,
    avatar_url,
    leader_badge,
    ml_tracking_tag,
    slug,
    amazon_tracking_tag
   FROM public.profiles;

CREATE OR REPLACE VIEW public.ofertas_ranked_general AS
 SELECT id,
    title,
    price,
    original_price,
    image_url,
    image_urls,
    msi_months,
    bank_coupon,
    tags,
    store,
    category,
    offer_url,
    description,
    steps,
    conditions,
    coupons,
    created_at,
    created_by,
    status,
    expires_at,
    COALESCE(upvotes_count, 0) AS up_votes,
    COALESCE(downvotes_count, 0) AS down_votes,
    COALESCE(upvotes_count, 0) * 2 - COALESCE(downvotes_count, 0) AS score,
    (COALESCE(upvotes_count, 0) * 2 - COALESCE(downvotes_count, 0))::double precision / power(GREATEST(COALESCE(EXTRACT(epoch FROM now() - created_at), 0::numeric) / 3600::numeric + 2::numeric, 2::numeric), 1.5)::double precision AS score_final,
    COALESCE(ranking_momentum, 0::numeric) AS ranking_momentum,
    COALESCE(reputation_weighted_score, 0::numeric) AS reputation_weighted_score,
    COALESCE(ranking_momentum, 0::numeric) + COALESCE(reputation_weighted_score, 0::numeric) AS ranking_blend
   FROM public.offers o;

CREATE OR REPLACE VIEW public.daily_system_metrics AS
 WITH o AS (
         SELECT date((offers.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_offers_created
           FROM public.offers
          WHERE offers.created_at IS NOT NULL
          GROUP BY (date((offers.created_at AT TIME ZONE 'UTC'::text)))
        ), v AS (
         SELECT date((offer_votes.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_votes
           FROM public.offer_votes
          WHERE offer_votes.created_at IS NOT NULL
          GROUP BY (date((offer_votes.created_at AT TIME ZONE 'UTC'::text)))
        ), ev_view AS (
         SELECT date((offer_events.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_views
           FROM public.offer_events
          WHERE offer_events.created_at IS NOT NULL AND offer_events.event_type = 'view'::text
          GROUP BY (date((offer_events.created_at AT TIME ZONE 'UTC'::text)))
        ), ev_out AS (
         SELECT date((offer_events.created_at AT TIME ZONE 'UTC'::text)) AS date,
            count(*) AS total_outbound
           FROM public.offer_events
          WHERE offer_events.created_at IS NOT NULL AND offer_events.event_type = 'outbound'::text
          GROUP BY (date((offer_events.created_at AT TIME ZONE 'UTC'::text)))
        )
 SELECT COALESCE(o.date, v.date, ev_view.date, ev_out.date) AS date,
    COALESCE(o.total_offers_created, 0::bigint) AS total_offers_created,
    COALESCE(v.total_votes, 0::bigint) AS total_votes,
    COALESCE(ev_view.total_views, 0::bigint) AS total_views,
    COALESCE(ev_out.total_outbound, 0::bigint) AS total_outbound,
    COALESCE(ev_out.total_outbound, 0::bigint)::numeric / NULLIF(COALESCE(ev_view.total_views, 0::bigint), 0)::numeric AS ctr
   FROM o
     FULL JOIN v ON v.date = o.date
     FULL JOIN ev_view ON ev_view.date = COALESCE(o.date, v.date)
     FULL JOIN ev_out ON ev_out.date = COALESCE(o.date, v.date, ev_view.date)
  ORDER BY (COALESCE(o.date, v.date, ev_view.date, ev_out.date)) DESC;

COMMIT;

-- ===========================================================================
-- EXCLUDED / TODO (do NOT invent here)
-- ===========================================================================
-- - communities / community_offers: STAGING CONFLICT (staging communities.id = bigint; prod = uuid)
-- - distribution_* tables
-- - rewards / affiliate_ledger / conversions / commissions / settlement / payouts
-- - hunter_* / price snapshots / mercadolibre_oauth_tokens
-- - reward_outbound_clicks / attribution foundation
-- - Triggers: offer_votes_counter_trigger, handle_new_user, set_updated_at, risk score, etc. (prod has them; bodies not fully exported in this file)
-- - Functions/RPCs beyond view dependencies
-- - Storage bucket offer-images (prod) vs ofertas/ofertas-images (staging) — metadata only; not created here
-- - Grants REVOKE patterns for offer_events/write_jobs_queue (prod service_role-only) — TODO verify exact grants
