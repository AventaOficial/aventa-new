-- Aventa Team OS database authorization cutover
-- Applied to staging and production on 2026-10-18.
-- Team OS permission grants mirror lib/team/permissions/grants.ts.
-- user_roles is retained only as the global platform-owner authority.
-- This migration is idempotent; it replaces only named staff policies that existed in each DB.

CREATE OR REPLACE FUNCTION public.team_os_user_has_permission(p_permission text,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT CASE
  WHEN p_user_id IS NULL OR p_permission NOT IN (
   'moderation.offers.read','moderation.offers.decide','moderation.reports.read','moderation.metrics.read',
   'hunter.offers.read','hunter.activity.read','hunter.batches.decide','growth.overview.read',
   'product.overview.read','community.overview.read','operations.overview.read','finance.overview.read'
  ) THEN false
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user_id AND ur.role='owner') THEN true
  ELSE EXISTS (
   SELECT 1 FROM public.team_memberships m
   WHERE m.user_id=p_user_id AND m.status='ACTIVE'
    AND CASE p_permission
     WHEN 'moderation.offers.read' THEN m.team_id='moderation' AND m.role IN ('moderator','senior_moderator','moderation_lead')
     WHEN 'moderation.offers.decide' THEN m.team_id='moderation' AND m.role IN ('moderator','senior_moderator','moderation_lead')
     WHEN 'moderation.reports.read' THEN m.team_id='moderation' AND m.role IN ('moderator','senior_moderator','moderation_lead')
     WHEN 'moderation.metrics.read' THEN m.team_id='moderation' AND m.role IN ('senior_moderator','moderation_lead')
     WHEN 'hunter.offers.read' THEN m.team_id='hunter' AND m.role IN ('hunter','hunter_lead')
     WHEN 'hunter.activity.read' THEN m.team_id='hunter' AND m.role IN ('hunter','hunter_lead')
     WHEN 'hunter.batches.decide' THEN m.team_id='hunter' AND m.role='hunter_lead'
     WHEN 'growth.overview.read' THEN m.team_id='growth' AND m.role IN ('growth_member','growth_lead')
     WHEN 'product.overview.read' THEN m.team_id='product' AND m.role IN ('product_member','product_lead')
     WHEN 'community.overview.read' THEN m.team_id='community' AND m.role IN ('community_member','community_lead')
     WHEN 'operations.overview.read' THEN m.team_id='operations' AND m.role IN ('operations_member','operations_lead')
     WHEN 'finance.overview.read' THEN m.team_id='finance' AND m.role='finance_viewer'
     ELSE false END
  )
 END;
$function$;

CREATE OR REPLACE FUNCTION public.team_os_has_permission(p_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_user_has_permission(p_permission, auth.uid()); $function$;

REVOKE ALL ON FUNCTION public.team_os_user_has_permission(text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_os_has_permission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.team_os_has_permission(text) TO authenticated;

DO $policies$
DECLARE p record; expr text;
BEGIN
 FOR p IN SELECT schemaname,tablename,policyname,cmd FROM pg_policies
  WHERE schemaname='public' AND policyname IN (
   'acquisition_scouts_select_staff','acquisition_sources_select_staff',
   'distribution_brands_select_staff','distribution_destinations_select_staff',
   'distribution_events_select_staff','distribution_publications_select_staff',
   'moderation_logs_select_staff','moderation_outcomes_select_staff',
   'offer_batch_item_events_select_staff','offer_batch_items_select_staff','offer_batches_select_staff',
   'offer_reports_select_staff','offers_select_staff','offer_qc_admin_moderator_delete',
   'offer_qc_admin_moderator_insert','offer_qc_admin_moderator_select','offer_qc_admin_moderator_update',
   'user_bans_delete_admin','user_bans_insert_admin','user_bans_select_admin','user_bans_update_admin'
  )
 LOOP
  expr := CASE
   WHEN p.policyname IN ('acquisition_scouts_select_staff','acquisition_sources_select_staff') THEN
    '(public.team_os_has_permission(''hunter.offers.read'') OR public.team_os_has_permission(''moderation.offers.read''))'
   WHEN p.policyname IN ('distribution_brands_select_staff','distribution_destinations_select_staff','distribution_events_select_staff','distribution_publications_select_staff') THEN
    '(public.team_os_has_permission(''growth.overview.read'') OR public.team_os_has_permission(''moderation.offers.read''))'
   WHEN p.policyname IN ('moderation_logs_select_staff','moderation_outcomes_select_staff') THEN
    '(public.team_os_has_permission(''moderation.offers.read'') OR public.team_os_has_permission(''moderation.metrics.read''))'
   WHEN p.policyname IN ('offer_batch_item_events_select_staff','offer_batch_items_select_staff','offer_batches_select_staff') THEN
    '(public.team_os_has_permission(''hunter.offers.read'') OR public.team_os_has_permission(''moderation.offers.read''))'
   WHEN p.policyname='offer_reports_select_staff' THEN 'public.team_os_has_permission(''moderation.reports.read'')'
   WHEN p.policyname='offers_select_staff' THEN
    '(public.team_os_has_permission(''moderation.offers.read'') OR public.team_os_has_permission(''operations.overview.read'') OR public.team_os_has_permission(''hunter.offers.read''))'
   WHEN p.policyname IN ('offer_qc_admin_moderator_delete','offer_qc_admin_moderator_insert','offer_qc_admin_moderator_select','offer_qc_admin_moderator_update') THEN
    'public.team_os_has_permission(''moderation.offers.decide'')'
   WHEN p.policyname='user_bans_select_admin' THEN 'public.team_os_has_permission(''moderation.reports.read'')'
   WHEN p.policyname IN ('user_bans_delete_admin','user_bans_insert_admin','user_bans_update_admin') THEN 'public.team_os_has_permission(''moderation.offers.decide'')'
   ELSE NULL END;
  IF expr IS NOT NULL THEN
   EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',p.policyname,p.schemaname,p.tablename);
   IF p.cmd='SELECT' THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR SELECT TO authenticated USING (%s)',p.policyname,p.schemaname,p.tablename,expr);
   ELSIF p.cmd='INSERT' THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR INSERT TO authenticated WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,expr);
   ELSIF p.cmd='UPDATE' THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)',p.policyname,p.schemaname,p.tablename,expr,expr);
   ELSIF p.cmd='DELETE' THEN
    EXECUTE format('CREATE POLICY %I ON %I.%I FOR DELETE TO authenticated USING (%s)',p.policyname,p.schemaname,p.tablename,expr);
   END IF;
  END IF;
 END LOOP;
END;
$policies$;

COMMENT ON FUNCTION public.team_os_has_permission(text) IS
 'Team OS RLS gate. ACTIVE team_memberships only; user_roles grants platform-owner authority only.';
