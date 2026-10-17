-- STAGING ONLY: consolidate the remaining profiles.role staff model into Team OS.
-- Prerequisite: docs/supabase-migrations/20261018_team_os_rls_policy_cutover.sql
-- Applied in staging on 2026-10-18; idempotent and safe to re-run.
-- Mutations without an explicit Team OS write permission remain owner-only.

CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.is_admin(); $function$;

CREATE OR REPLACE FUNCTION public.es_mod_a()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

CREATE OR REPLACE FUNCTION public.es_mod_b()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

CREATE OR REPLACE FUNCTION public.es_lider()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.is_admin(); $function$;

-- "Staff" means owner or an active moderator with an explicit decision permission,
-- never merely any ACTIVE team membership.
CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=uid AND ur.role='owner')
     OR public.team_os_user_has_permission('moderation.offers.decide',uid);
$function$;

-- Retire the obsolete trigger that forced profiles.role='admin'.
DROP TRIGGER IF EXISTS trg_profiles_no_zero_admin ON public.profiles;
CREATE OR REPLACE FUNCTION public.ensure_at_least_one_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ BEGIN RETURN NULL; END; $function$;

-- Keep compatibility for any old SQL caller, but never return legacy staff roles.
CREATE OR REPLACE FUNCTION public."current_role"()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner'
 ) THEN 'owner'::text ELSE 'user'::text END;
$function$;

-- Shut down legacy profile-role mutation RPC.
CREATE OR REPLACE FUNCTION public.admin_set_user_admin(p_user_id uuid,p_is_admin boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 RAISE EXCEPTION 'legacy_profile_role_management_disabled; use Team OS membership management'
   USING ERRCODE='42501';
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_set_user_admin(uuid,boolean) FROM PUBLIC, anon, authenticated;

-- The old view no longer exposes/derives roles from profile metadata or other users.
CREATE OR REPLACE VIEW public.user_roles_from_profiles_v AS
SELECT p.id AS user_id,
       CASE WHEN EXISTS (
         SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='owner'
       ) THEN 'owner'::text ELSE 'user'::text END AS role
FROM public.profiles p
WHERE p.id=auth.uid();

DO $policies$
BEGIN
  IF to_regclass('public.affiliate_clicks') IS NOT NULL THEN
    DROP POLICY IF EXISTS select_admin_only_aff_clicks ON public.affiliate_clicks;
    DROP POLICY IF EXISTS affiliate_clicks_team_os_finance_select ON public.affiliate_clicks;
    CREATE POLICY affiliate_clicks_team_os_finance_select ON public.affiliate_clicks
      FOR SELECT TO authenticated USING (public.team_os_has_permission('finance.overview.read'));
  END IF;

  IF to_regclass('public.affiliate_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS select_admin_only_aff_events ON public.affiliate_events;
    DROP POLICY IF EXISTS affiliate_events_team_os_finance_select ON public.affiliate_events;
    CREATE POLICY affiliate_events_team_os_finance_select ON public.affiliate_events
      FOR SELECT TO authenticated USING (public.team_os_has_permission('finance.overview.read'));
  END IF;

  IF to_regclass('public.affiliate_configs') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_affcfg_admin ON public.affiliate_configs;
    DROP POLICY IF EXISTS p_affcfg_select ON public.affiliate_configs;
    DROP POLICY IF EXISTS p_affcfg_owner_all ON public.affiliate_configs;
    CREATE POLICY p_affcfg_owner_all ON public.affiliate_configs
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.affiliate_programs') IS NOT NULL THEN
    DROP POLICY IF EXISTS affprograms_admin ON public.affiliate_programs;
    DROP POLICY IF EXISTS affprograms_owner_all ON public.affiliate_programs;
    CREATE POLICY affprograms_owner_all ON public.affiliate_programs
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.affiliate_verifications') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_affver_insert ON public.affiliate_verifications;
    DROP POLICY IF EXISTS p_affver_select ON public.affiliate_verifications;
    DROP POLICY IF EXISTS affiliate_verifications_team_os_insert ON public.affiliate_verifications;
    DROP POLICY IF EXISTS affiliate_verifications_team_os_select ON public.affiliate_verifications;
    CREATE POLICY affiliate_verifications_team_os_insert ON public.affiliate_verifications
      FOR INSERT TO authenticated WITH CHECK (public.team_os_has_permission('moderation.offers.decide'));
    CREATE POLICY affiliate_verifications_team_os_select ON public.affiliate_verifications
      FOR SELECT TO authenticated USING (public.team_os_has_permission('moderation.offers.read'));
  END IF;

  IF to_regclass('public.community_members') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_comm_mem_delete ON public.community_members;
    DROP POLICY IF EXISTS p_comm_mem_upsert ON public.community_members;
    DROP POLICY IF EXISTS community_members_owner_delete ON public.community_members;
    DROP POLICY IF EXISTS community_members_owner_insert ON public.community_members;
    CREATE POLICY community_members_owner_delete ON public.community_members
      FOR DELETE TO authenticated USING (public.is_admin());
    CREATE POLICY community_members_owner_insert ON public.community_members
      FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.merchants') IS NOT NULL THEN
    DROP POLICY IF EXISTS merchants_admin ON public.merchants;
    DROP POLICY IF EXISTS merchants_owner_all ON public.merchants;
    CREATE POLICY merchants_owner_all ON public.merchants
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.moderation_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_modlog_insert ON public.moderation_log;
    DROP POLICY IF EXISTS p_modlog_select ON public.moderation_log;
    DROP POLICY IF EXISTS moderation_log_team_os_insert ON public.moderation_log;
    DROP POLICY IF EXISTS moderation_log_team_os_select ON public.moderation_log;
    CREATE POLICY moderation_log_team_os_insert ON public.moderation_log
      FOR INSERT TO authenticated WITH CHECK (public.team_os_has_permission('moderation.offers.decide'));
    CREATE POLICY moderation_log_team_os_select ON public.moderation_log
      FOR SELECT TO authenticated USING (public.team_os_has_permission('moderation.offers.read'));
  END IF;

  IF to_regclass('public.ofertas') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ofertas update admin" ON public.ofertas;
    DROP POLICY IF EXISTS ofertas_update_staff ON public.ofertas;
    DROP POLICY IF EXISTS ofertas_delete_staff ON public.ofertas;
    DROP POLICY IF EXISTS ofertas_update_team_os_moderation ON public.ofertas;
    DROP POLICY IF EXISTS ofertas_delete_owner_only ON public.ofertas;
    CREATE POLICY ofertas_update_team_os_moderation ON public.ofertas
      FOR UPDATE TO authenticated
      USING (public.team_os_has_permission('moderation.offers.decide'))
      WITH CHECK (public.team_os_has_permission('moderation.offers.decide'));
    CREATE POLICY ofertas_delete_owner_only ON public.ofertas
      FOR DELETE TO authenticated USING (public.is_admin());
  END IF;

  IF to_regclass('public.offer_fingerprints') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_fprints_delete ON public.offer_fingerprints;
    DROP POLICY IF EXISTS p_fprints_insert ON public.offer_fingerprints;
    DROP POLICY IF EXISTS p_fprints_select ON public.offer_fingerprints;
    DROP POLICY IF EXISTS p_fprints_update ON public.offer_fingerprints;
    DROP POLICY IF EXISTS offer_fingerprints_owner_delete ON public.offer_fingerprints;
    DROP POLICY IF EXISTS offer_fingerprints_team_os_insert ON public.offer_fingerprints;
    DROP POLICY IF EXISTS offer_fingerprints_team_os_select ON public.offer_fingerprints;
    DROP POLICY IF EXISTS offer_fingerprints_team_os_update ON public.offer_fingerprints;
    CREATE POLICY offer_fingerprints_owner_delete ON public.offer_fingerprints
      FOR DELETE TO authenticated USING (public.is_admin());
    CREATE POLICY offer_fingerprints_team_os_insert ON public.offer_fingerprints
      FOR INSERT TO authenticated WITH CHECK (public.team_os_has_permission('moderation.offers.decide'));
    CREATE POLICY offer_fingerprints_team_os_select ON public.offer_fingerprints
      FOR SELECT TO authenticated USING (public.team_os_has_permission('moderation.offers.read'));
    CREATE POLICY offer_fingerprints_team_os_update ON public.offer_fingerprints
      FOR UPDATE TO authenticated
      USING (public.team_os_has_permission('moderation.offers.decide'))
      WITH CHECK (public.team_os_has_permission('moderation.offers.decide'));
  END IF;

  IF to_regclass('public.offer_interactions') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_interactions_select ON public.offer_interactions;
    DROP POLICY IF EXISTS offer_interactions_team_os_select ON public.offer_interactions;
    CREATE POLICY offer_interactions_team_os_select ON public.offer_interactions
      FOR SELECT TO authenticated USING (public.team_os_has_permission('moderation.offers.read'));
  END IF;

  IF to_regclass('public.promotion_requests') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_prom_insert ON public.promotion_requests;
    DROP POLICY IF EXISTS p_prom_select ON public.promotion_requests;
    DROP POLICY IF EXISTS p_prom_update ON public.promotion_requests;
    DROP POLICY IF EXISTS promotion_requests_owner_insert ON public.promotion_requests;
    DROP POLICY IF EXISTS promotion_requests_team_os_select ON public.promotion_requests;
    DROP POLICY IF EXISTS promotion_requests_owner_update ON public.promotion_requests;
    CREATE POLICY promotion_requests_owner_insert ON public.promotion_requests
      FOR INSERT TO authenticated WITH CHECK (public.is_admin());
    CREATE POLICY promotion_requests_team_os_select ON public.promotion_requests
      FOR SELECT TO authenticated USING (public.team_os_has_permission('community.overview.read'));
    CREATE POLICY promotion_requests_owner_update ON public.promotion_requests
      FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.site_settings') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_settings_admin ON public.site_settings;
    DROP POLICY IF EXISTS site_settings_owner_all ON public.site_settings;
    CREATE POLICY site_settings_owner_all ON public.site_settings
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.stores') IS NOT NULL THEN
    DROP POLICY IF EXISTS p_stores_admin ON public.stores;
    DROP POLICY IF EXISTS stores_owner_all ON public.stores;
    CREATE POLICY stores_owner_all ON public.stores
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;

  IF to_regclass('public.ui_events') IS NOT NULL THEN
    DROP POLICY IF EXISTS allow_select_admin ON public.ui_events;
    DROP POLICY IF EXISTS select_admin_only_ui_events ON public.ui_events;
    DROP POLICY IF EXISTS ui_events_admin_all ON public.ui_events;
    DROP POLICY IF EXISTS ui_events_team_os_operations_select ON public.ui_events;
    DROP POLICY IF EXISTS ui_events_owner_all ON public.ui_events;
    CREATE POLICY ui_events_team_os_operations_select ON public.ui_events
      FOR SELECT TO authenticated USING (public.team_os_has_permission('operations.overview.read'));
    CREATE POLICY ui_events_owner_all ON public.ui_events
      FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
  END IF;
END;
$policies$;

-- Profile metadata is no longer authorization. Normalize stale labels.
UPDATE public.profiles
SET role='user'
WHERE role IN ('admin','moderator','analyst','finance','marketing','gerente','lider','mod_A','mod_B');

-- Preserve only the one global role. Team access is in team_memberships.
DELETE FROM public.user_roles WHERE role IS DISTINCT FROM 'owner';

COMMENT ON COLUMN public.profiles.role IS
  'Deprecated metadata only. Authorization source: user_roles.owner for platform owner; team_memberships for collaborators.';
COMMENT ON VIEW public.user_roles_from_profiles_v IS
  'Compatibility projection for the current authenticated user only; never a staff authorization source.';
