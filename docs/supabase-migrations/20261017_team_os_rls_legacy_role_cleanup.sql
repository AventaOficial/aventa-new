-- Team OS RLS closeout: remove staff-role authorization from policies/functions.
-- Requires the role-copy migration to have created the equivalent memberships first.
-- user_roles remains only as the source of global Owner authority in production.

DO $team_os_preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN (
      VALUES
        ('moderator', 'moderation', 'moderator'),
        ('marketing', 'growth', 'growth_member'),
        ('finance', 'finance', 'finance_viewer'),
        ('analyst', 'operations', 'operations_member')
    ) AS role_map(legacy_role, team_id, team_role)
      ON role_map.legacy_role = ur.role
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.team_memberships tm
      WHERE tm.user_id = ur.user_id
        AND tm.team_id = role_map.team_id
        AND tm.role = role_map.team_role
        AND tm.status IN ('ACTIVE', 'SUSPENDED')
    )
  ) THEN
    RAISE EXCEPTION
      'Team OS RLS cleanup blocked: a mapped legacy role lacks an equivalent ACTIVE/SUSPENDED membership.';
  END IF;
END
$team_os_preflight$;

CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = 'owner'
  );
$function$;

CREATE OR REPLACE FUNCTION public.has_active_team_role(
  p_team_id text,
  p_roles text[] DEFAULT NULL::text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = (SELECT auth.uid())
      AND tm.team_id = p_team_id
      AND tm.status = 'ACTIVE'
      AND (p_roles IS NULL OR tm.role = ANY (p_roles))
  );
$function$;

REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_team_role(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_team_role(text, text[]) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_platform_owner()
      OR public.has_active_team_role('moderation', ARRAY['moderator']::text[]);
$function$;

CREATE OR REPLACE FUNCTION public.user_has_moderation_role()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.is_platform_owner()
      OR public.has_active_team_role('moderation', ARRAY['moderator']::text[]);
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_status(
  p_payout_id bigint,
  p_status text,
  p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_method text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Payout state changes remain globally Owner-only.
  IF NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public.payouts') IS NULL THEN
    RAISE EXCEPTION 'payouts_table_unavailable' USING ERRCODE = '42P01';
  END IF;

  UPDATE public.payouts
  SET status = p_status,
      paid_at = COALESCE(paid_at, p_paid_at),
      notes = COALESCE(p_notes, notes)
  WHERE id = p_payout_id;

  IF to_regclass('public.moderation_log') IS NOT NULL THEN
    INSERT INTO public.moderation_log(entity, entity_id, action, actor_id, meta)
    VALUES (
      'payout',
      p_payout_id,
      'status_change',
      auth.uid(),
      jsonb_build_object(
        'new_status', p_status,
        'paid_at', p_paid_at,
        'method', p_method,
        'reference', p_reference,
        'notes', p_notes
      )
    );
  END IF;
END;
$function$;

DROP POLICY IF EXISTS acquisition_scouts_select_staff ON public.acquisition_scouts;
CREATE POLICY acquisition_scouts_select_staff
  ON public.acquisition_scouts FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS acquisition_sources_select_staff ON public.acquisition_sources;
CREATE POLICY acquisition_sources_select_staff
  ON public.acquisition_sources FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS moderation_logs_select_staff ON public.moderation_logs;
CREATE POLICY moderation_logs_select_staff
  ON public.moderation_logs FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS moderation_outcomes_select_staff ON public.moderation_outcomes;
CREATE POLICY moderation_outcomes_select_staff
  ON public.moderation_outcomes FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_batch_item_events_select_staff ON public.offer_batch_item_events;
CREATE POLICY offer_batch_item_events_select_staff
  ON public.offer_batch_item_events FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_batch_items_select_staff ON public.offer_batch_items;
CREATE POLICY offer_batch_items_select_staff
  ON public.offer_batch_items FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_batches_select_staff ON public.offer_batches;
CREATE POLICY offer_batches_select_staff
  ON public.offer_batches FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_qc_admin_moderator_delete ON public.offer_quality_checks;
CREATE POLICY offer_qc_admin_moderator_delete
  ON public.offer_quality_checks FOR DELETE TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_qc_admin_moderator_insert ON public.offer_quality_checks;
CREATE POLICY offer_qc_admin_moderator_insert
  ON public.offer_quality_checks FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_qc_admin_moderator_select ON public.offer_quality_checks;
CREATE POLICY offer_qc_admin_moderator_select
  ON public.offer_quality_checks FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_qc_admin_moderator_update ON public.offer_quality_checks;
CREATE POLICY offer_qc_admin_moderator_update
  ON public.offer_quality_checks FOR UPDATE TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offer_reports_select_staff ON public.offer_reports;
CREATE POLICY offer_reports_select_staff
  ON public.offer_reports FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS offers_select_staff ON public.offers;
CREATE POLICY offers_select_staff
  ON public.offers FOR SELECT TO authenticated
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
    OR public.has_active_team_role('operations', NULL::text[])
  );

DROP POLICY IF EXISTS user_bans_delete_admin ON public.user_bans;
CREATE POLICY user_bans_delete_admin
  ON public.user_bans FOR DELETE TO public
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS user_bans_insert_admin ON public.user_bans;
CREATE POLICY user_bans_insert_admin
  ON public.user_bans FOR INSERT TO public
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS user_bans_select_admin ON public.user_bans;
CREATE POLICY user_bans_select_admin
  ON public.user_bans FOR SELECT TO public
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

DROP POLICY IF EXISTS user_bans_update_admin ON public.user_bans;
CREATE POLICY user_bans_update_admin
  ON public.user_bans FOR UPDATE TO public
  USING (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  )
  WITH CHECK (
    public.is_platform_owner()
    OR public.has_active_team_role('moderation', ARRAY['moderator']::text[])
  );

-- Remove mapped legacy collaborator roles only after every account has a
-- matching Team OS membership. Keep ambiguous admin/gerente rows for manual mapping.
DELETE FROM public.user_roles ur
USING (
  VALUES
    ('moderator', 'moderation', 'moderator'),
    ('marketing', 'growth', 'growth_member'),
    ('finance', 'finance', 'finance_viewer'),
    ('analyst', 'operations', 'operations_member')
) AS role_map(legacy_role, team_id, team_role)
WHERE ur.role = role_map.legacy_role
  AND EXISTS (
    SELECT 1
    FROM public.team_memberships tm
    WHERE tm.user_id = ur.user_id
      AND tm.team_id = role_map.team_id
      AND tm.role = role_map.team_role
      AND tm.status IN ('ACTIVE', 'SUSPENDED')
  );

COMMENT ON TABLE public.user_roles IS
  'Global platform authority only: retain owner. Collaborator authorization is Team OS membership-based.';
