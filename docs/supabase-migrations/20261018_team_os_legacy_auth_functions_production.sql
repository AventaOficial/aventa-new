-- Production function hardening applied 2026-10-18.
-- The money-adjacent payout status RPC remains platform-owner-only.
-- Moderation compatibility helpers now authorize through active Team OS membership.

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

CREATE OR REPLACE FUNCTION public.user_has_moderation_role()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public, pg_temp
AS $function$ SELECT public.team_os_has_permission('moderation.offers.decide'); $function$;

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
