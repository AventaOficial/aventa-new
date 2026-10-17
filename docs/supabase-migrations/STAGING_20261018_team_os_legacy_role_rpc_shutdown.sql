-- Staging has historical role-management and moderation RPCs that do not exist in production.
-- Applied to staging 2026-10-18 after the shared RLS policy cutover.
-- Legacy staff-role mutations are blocked; owner is the only global role.
-- Staff features derive from ACTIVE Team OS memberships.

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

CREATE OR REPLACE FUNCTION public.is_moderator(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_user_has_permission('moderation.offers.decide', uid); $function$;

CREATE OR REPLACE FUNCTION public.user_has_moderation_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

CREATE OR REPLACE FUNCTION public.has_mod_powers(uid uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_user_has_permission('moderation.offers.decide', uid); $function$;

CREATE OR REPLACE FUNCTION public.has_role(p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT p_role = 'owner' AND EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner'
 );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner');
$function$;

CREATE OR REPLACE FUNCTION public.is_admin_or_analyst()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('operations.overview.read'); $function$;

CREATE OR REPLACE FUNCTION public.is_staff(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=uid AND ur.role='owner')
 OR EXISTS (SELECT 1 FROM public.team_memberships m WHERE m.user_id=uid AND m.status='ACTIVE');
$function$;

CREATE OR REPLACE FUNCTION public.debug_is_admin_for(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p_user AND ur.role='owner');
$function$;

CREATE OR REPLACE FUNCTION public.get_session_roles()
RETURNS TABLE(is_admin boolean, primary_role text, roles text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
 SELECT
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner') AS is_admin,
  CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner')
   THEN 'owner'::text ELSE 'user'::text END AS primary_role,
  CASE WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner')
   THEN ARRAY['owner']::text[] ELSE ARRAY[]::text[] END AS roles;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_role_by_email(p_email text,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 RAISE EXCEPTION 'legacy_staff_role_management_disabled; use Team OS membership management' USING ERRCODE='42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_role(p_target uuid,p_role text,p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 RAISE EXCEPTION 'legacy_staff_role_management_disabled; use Team OS membership management' USING ERRCODE='42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.revoke_role(p_target uuid,p_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 RAISE EXCEPTION 'legacy_staff_role_management_disabled; use Team OS membership management' USING ERRCODE='42501';
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_role_by_email(text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_role(uuid,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_role(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fn_communities_default_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 IF public.team_os_user_has_permission('moderation.offers.decide', NEW.owner_id) THEN
  NEW.status := 'approved';
 ELSE
  NEW.status := 'pending';
 END IF;
 RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_payout_status(
 p_payout_id bigint,
 p_status text,
 p_paid_at timestamptz DEFAULT NULL,
 p_method text DEFAULT NULL,
 p_reference text DEFAULT NULL,
 p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
  SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='owner'
 ) THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
 END IF;
 IF to_regclass('public.payouts') IS NULL THEN
  RAISE EXCEPTION 'payouts_table_unavailable' USING ERRCODE='42P01';
 END IF;
 UPDATE public.payouts
 SET status=p_status, paid_at=COALESCE(paid_at,p_paid_at), notes=COALESCE(p_notes,notes)
 WHERE id=p_payout_id;
 IF to_regclass('public.moderation_log') IS NOT NULL THEN
  INSERT INTO public.moderation_log(entity,entity_id,action,actor_id,meta)
  VALUES ('payout',p_payout_id,'status_change',auth.uid(),
   jsonb_build_object('new_status',p_status,'paid_at',p_paid_at,'method',p_method,'reference',p_reference,'notes',p_notes));
 END IF;
END;
$function$;
