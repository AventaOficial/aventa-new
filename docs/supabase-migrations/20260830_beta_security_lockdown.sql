-- =============================================================================
-- AVENTA — Lockdown beta privada (2026-08-30)
-- =============================================================================
-- ESTRATEGIA DE VERSIONADO (no destructiva):
--   1) Esta migración es ADITIVA. No DROP TABLE, no borra datos, no reescribe
--      migraciones históricas de docs/supabase-migrations/.
--   2) No es un baseline del esquema de producción. Un baseline real se obtiene
--      con `pg_dump --schema-only` del proyecto vivo y se archiva aparte.
--   3) Contiene: RLS de user_roles + policies de escritura para tablas críticas
--      + CHECK de offer_votes.value alineado con la API (+2/−1 … +12/−6).
--   4) Service role (APIs Next) BYPASSEA RLS. Las policies protegen el cliente
--      (anon key) para que un usuario no se auto-asigne owner ni vote/escriba
--      directo contra PostgREST.
--
-- APLICAR: Supabase Dashboard → SQL Editor → Run.
-- Idempotente: DROP POLICY IF EXISTS + CREATE; constraints DROP IF EXISTS.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) user_roles — tabla si no existe + RLS deny-by-default para writes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_roles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles FROM anon;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT ALL ON TABLE public.user_roles TO service_role;

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_select_authenticated ON public.user_roles;
DROP POLICY IF EXISTS user_roles_insert_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_all_authenticated ON public.user_roles;
DROP POLICY IF EXISTS "Users can insert own role" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own role" ON public.user_roles;

-- El cliente solo puede LEER su propio rol (layouts /admin y /equipo).
-- INSERT/UPDATE/DELETE: sin policies → denegado para anon/authenticated.
-- La gestión de roles ocurre solo vía API (service_role + requireTeamManagement).
CREATE POLICY user_roles_select_own
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMENT ON TABLE public.user_roles IS
  'Roles staff. Escritura solo service_role. SELECT propio para el layout autenticado.';

-- -----------------------------------------------------------------------------
-- 2) offers — lectura pública/propia/staff; escrituras solo service_role
-- -----------------------------------------------------------------------------
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS offers_insert_authenticated ON public.offers;
DROP POLICY IF EXISTS offers_update_own ON public.offers;
DROP POLICY IF EXISTS offers_delete_own ON public.offers;
DROP POLICY IF EXISTS offers_insert_own ON public.offers;
DROP POLICY IF EXISTS offers_all_authenticated ON public.offers;

-- SELECT públicas ya definidas en security_audit_lockdown_2026_08_18.sql.
-- Recrear por si ese lockdown no se aplicó. deleted_at es opcional.
DROP POLICY IF EXISTS offers_select_public ON public.offers;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'offers'
      AND column_name = 'deleted_at'
  ) THEN
    EXECUTE $p$
      CREATE POLICY offers_select_public
        ON public.offers
        FOR SELECT
        TO anon, authenticated
        USING (
          deleted_at IS NULL
          AND status = ANY (ARRAY['approved'::text, 'published'::text])
          AND (expires_at IS NULL OR expires_at > now())
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY offers_select_public
        ON public.offers
        FOR SELECT
        TO anon, authenticated
        USING (
          status = ANY (ARRAY['approved'::text, 'published'::text])
          AND (expires_at IS NULL OR expires_at > now())
        )
    $p$;
  END IF;
END $$;

DROP POLICY IF EXISTS offers_owner_read_own ON public.offers;
CREATE POLICY offers_owner_read_own
  ON public.offers
  FOR SELECT
  TO authenticated
  USING (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS offers_select_staff ON public.offers;
CREATE POLICY offers_select_staff
  ON public.offers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text, 'analyst'::text])
    )
  );

-- -----------------------------------------------------------------------------
-- 3) offer_votes — el usuario solo ve SUS votos; writes vía API
-- -----------------------------------------------------------------------------
ALTER TABLE public.offer_votes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.offer_votes FROM PUBLIC;
REVOKE ALL ON TABLE public.offer_votes FROM anon;
GRANT SELECT ON TABLE public.offer_votes TO authenticated;
GRANT ALL ON TABLE public.offer_votes TO service_role;

DROP POLICY IF EXISTS offer_votes_select_own ON public.offer_votes;
DROP POLICY IF EXISTS offer_votes_insert_own ON public.offer_votes;
DROP POLICY IF EXISTS offer_votes_update_own ON public.offer_votes;
DROP POLICY IF EXISTS offer_votes_delete_own ON public.offer_votes;
DROP POLICY IF EXISTS offer_votes_all ON public.offer_votes;

CREATE POLICY offer_votes_select_own
  ON public.offer_votes
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_votes_offer_user
  ON public.offer_votes (offer_id, user_id);

-- CHECK alineado con lib/votes/reputationWeights.ts
ALTER TABLE public.offer_votes
  DROP CONSTRAINT IF EXISTS offer_votes_value_check;

ALTER TABLE public.offer_votes
  ADD CONSTRAINT offer_votes_value_check
  CHECK (value = ANY (ARRAY[2, 4, 8, 12, -1, -2, -4, -6]))
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 4) offer_events — telemetría: sin lectura/escritura desde el cliente
-- -----------------------------------------------------------------------------
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.offer_events FROM PUBLIC;
REVOKE ALL ON TABLE public.offer_events FROM anon;
REVOKE ALL ON TABLE public.offer_events FROM authenticated;
GRANT ALL ON TABLE public.offer_events TO service_role;

DROP POLICY IF EXISTS offer_events_select ON public.offer_events;
DROP POLICY IF EXISTS offer_events_insert ON public.offer_events;
DROP POLICY IF EXISTS offer_events_all ON public.offer_events;

-- -----------------------------------------------------------------------------
-- 5) comments — lectura de aprobados + propios; writes vía API
-- -----------------------------------------------------------------------------
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.comments TO anon, authenticated;

DROP POLICY IF EXISTS comments_select_public ON public.comments;
DROP POLICY IF EXISTS comments_insert_own ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own ON public.comments;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'comments'
      AND column_name = 'status'
  ) THEN
    EXECUTE $p$
      CREATE POLICY comments_select_public
        ON public.comments
        FOR SELECT
        TO anon, authenticated
        USING (
          status = 'approved'
          OR user_id = (SELECT auth.uid())
        )
    $p$;
  ELSE
    EXECUTE $p$
      CREATE POLICY comments_select_public
        ON public.comments
        FOR SELECT
        TO anon, authenticated
        USING (true)
    $p$;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 6) offer_reports — solo el reportero ve los suyos; staff ve todos; writes API
-- -----------------------------------------------------------------------------
ALTER TABLE public.offer_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.offer_reports FROM PUBLIC;
REVOKE ALL ON TABLE public.offer_reports FROM anon;
GRANT SELECT ON TABLE public.offer_reports TO authenticated;
GRANT ALL ON TABLE public.offer_reports TO service_role;

DROP POLICY IF EXISTS offer_reports_select_own ON public.offer_reports;
DROP POLICY IF EXISTS offer_reports_select_staff ON public.offer_reports;
DROP POLICY IF EXISTS offer_reports_insert_own ON public.offer_reports;

CREATE POLICY offer_reports_select_own
  ON public.offer_reports
  FOR SELECT
  TO authenticated
  USING (reporter_id = (SELECT auth.uid()));

CREATE POLICY offer_reports_select_staff
  ON public.offer_reports
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

-- -----------------------------------------------------------------------------
-- 7) moderation_logs — solo staff de moderación
-- -----------------------------------------------------------------------------
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.moderation_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.moderation_logs FROM anon;
GRANT SELECT ON TABLE public.moderation_logs TO authenticated;
GRANT ALL ON TABLE public.moderation_logs TO service_role;

DROP POLICY IF EXISTS moderation_logs_select_staff ON public.moderation_logs;
DROP POLICY IF EXISTS moderation_logs_insert_staff ON public.moderation_logs;

CREATE POLICY moderation_logs_select_staff
  ON public.moderation_logs
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

COMMIT;

-- Post-aplicación recomendado (cuando no queden value=1 legacy):
-- ALTER TABLE public.offer_votes VALIDATE CONSTRAINT offer_votes_value_check;
