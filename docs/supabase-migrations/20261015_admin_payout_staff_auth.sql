-- Payout status transitions: authenticated staff only (canonical user_roles).
-- Aligns with app requireUsersLogs (owner/admin). Does not use profiles.role alone.
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'admin')
  ) THEN
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

REVOKE ALL ON FUNCTION public.admin_mark_payout_status(bigint, text, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_payout_status(bigint, text, timestamptz, text, text, text) TO authenticated, service_role;
