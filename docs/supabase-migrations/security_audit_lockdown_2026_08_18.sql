-- =============================================================================
-- AVENTA — Lockdown post-auditoría (18 ago 2026)
-- Proyecto vivo: mkgsrpsuvedwwlzmzmzh
-- =============================================================================
-- QUÉ HACE:
--   1) profiles: REVOKE amplio; SELECT solo columnas públicas; UPDATE solo
--      campos que el cliente realmente escribe; fiscales y privilegios solo
--      service_role.
--   2) offers: una SELECT pública estricta (status + deleted_at + expires_at);
--      staff aparte; se elimina offers_public_read_approved (demasiado laxa).
--   3) app_config: sin lectura anon/auth (la API pública ya usa service_role).
--   4) get_profile_by_slug: ya no SETOF profiles; columnas públicas; EXECUTE
--      solo service_role.
--   5) REVOKE EXECUTE de RPCs DEFINER mutadores; search_path fijo.
--
-- QUÉ NO TOCA:
--   ofertas_ranked_general / public_profiles_view (no DROP, no invoker=false)
--   write_jobs_queue (sigue sin policies públicas)
--   schemas auth / realtime / vault
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) profiles — grants de columna
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.profiles FROM authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;

GRANT SELECT (
  id,
  username,
  avatar_url,
  created_at,
  display_name,
  onboarding_completed,
  offers_submitted_count,
  offers_approved_count,
  offers_rejected_count,
  display_name_updated_at,
  reputation_score,
  reputation_level,
  slug,
  leader_badge,
  ml_tracking_tag,
  amazon_tracking_tag,
  name_saved_in_settings_at
) ON public.profiles TO anon, authenticated;

GRANT UPDATE (
  display_name,
  display_name_updated_at,
  name_saved_in_settings_at,
  slug,
  onboarding_completed,
  avatar_url
) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

-- INSERT lo hace handle_new_user (definer) o /api/sync-profile (service_role)
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

-- -----------------------------------------------------------------------------
-- 2) offers — SELECT pública única y estricta
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS offers_public_read_approved ON public.offers;
DROP POLICY IF EXISTS offers_select_anon ON public.offers;
DROP POLICY IF EXISTS offers_select_authenticated ON public.offers;

DROP POLICY IF EXISTS offers_select_public ON public.offers;
CREATE POLICY offers_select_public
  ON public.offers
  FOR SELECT
  TO anon, authenticated
  USING (
    deleted_at IS NULL
    AND status = ANY (ARRAY['approved'::text, 'published'::text])
    AND (expires_at IS NULL OR expires_at > now())
  );

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
        AND ur.role = ANY (ARRAY['admin'::text, 'moderator'::text, 'owner'::text])
    )
  );

-- -----------------------------------------------------------------------------
-- 3) app_config — solo service_role
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS app_config_select_public ON public.app_config;
REVOKE ALL ON TABLE public.app_config FROM PUBLIC;
REVOKE ALL ON TABLE public.app_config FROM anon;
REVOKE ALL ON TABLE public.app_config FROM authenticated;
GRANT ALL ON TABLE public.app_config TO service_role;

-- -----------------------------------------------------------------------------
-- 4) get_profile_by_slug — tipo estrecho + EXECUTE service_role
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_profile_by_slug(text);

CREATE FUNCTION public.get_profile_by_slug(p_slug text)
RETURNS TABLE (
  id uuid,
  display_name text,
  avatar_url text,
  slug text,
  leader_badge text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s text := regexp_replace(
    lower(btrim(regexp_replace(coalesce(p_slug, ''), '\s+', '-', 'g'))),
    '[^a-z0-9-]',
    '',
    'g'
  );
BEGIN
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.slug, p.leader_badge
  FROM public.profiles p
  WHERE p.slug IS NOT NULL
    AND btrim(p.slug) <> ''
    AND lower(btrim(p.slug)) = lower(btrim(p_slug))
  LIMIT 1;

  IF FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url, p.slug, p.leader_badge
  FROM public.profiles p
  WHERE (p.slug IS NULL OR btrim(coalesce(p.slug, '')) = '')
    AND regexp_replace(
      lower(btrim(regexp_replace(coalesce(p.display_name, ''), '\s+', '-', 'g'))),
      '[^a-z0-9-]',
      '',
      'g'
    ) = s
    AND s <> ''
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_profile_by_slug(text) IS
  'Perfil público por slug. No expone columnas fiscales ni de privilegio.';

REVOKE ALL ON FUNCTION public.get_profile_by_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_by_slug(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_by_slug(text) TO service_role;

-- -----------------------------------------------------------------------------
-- 5) EXECUTE de DEFINER mutadores + helpers RLS
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.user_has_moderation_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_moderation_role() TO authenticated, service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname = ANY (ARRAY[
        'compute_offer_risk_score',
        'get_user_vote',
        'handle_new_user',
        'increment_offers_approved_count',
        'increment_offers_rejected_count',
        'increment_offers_submitted_count',
        'offer_event_counts_for_offers',
        'offer_vote_summary',
        'offer_votes_counter_trigger',
        'offer_votes_recalculate_function',
        'recalculate_offer_metrics',
        'recalculate_offer_reputation_weighted_score',
        'recalculate_offers_for_voter',
        'recalculate_user_reputation',
        'refresh_offer_performance_metrics',
        'trigger_compute_risk_score',
        'trigger_recalculate_offer_on_vote',
        'upsert_user_activity'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6) search_path fijo en funciones public (DEFINER y triggers)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
          WHERE cfg LIKE 'search_path=%'
        )
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $$;

COMMIT;
