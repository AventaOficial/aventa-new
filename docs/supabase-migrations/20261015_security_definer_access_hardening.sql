-- Security hardening for staging-first rollout.
-- Goal: make public-facing views respect underlying RLS and remove anonymous/user execution
-- from legacy administrative SECURITY DEFINER RPCs that expose internal data or mutate global state.
-- This migration is idempotent and guards objects that may not exist in every environment.
-- It does not change tables, rows, application routes, reward states, or payout states.

DO $migration$
DECLARE
  v_view text;
BEGIN
  FOREACH v_view IN ARRAY ARRAY[
    'offers_normalized',
    'offers_legacy_compat_v',
    'ofertas_ranked_general',
    'user_roles_effective',
    'v_affiliate_revenue_by_user',
    'v_payouts_pending',
    'daily_system_metrics'
  ]
  LOOP
    IF to_regclass(format('public.%I', v_view)) IS NOT NULL THEN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v_view);
    END IF;
  END LOOP;

  -- These are internal operational views. App routes use the server-only service_role client.
  IF to_regclass('public.daily_system_metrics') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.daily_system_metrics FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.daily_system_metrics TO service_role';
  END IF;

  IF to_regclass('public.v_payouts_pending') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON TABLE public.v_payouts_pending FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.v_payouts_pending TO service_role';
  END IF;
END
$migration$;

DO $migration$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.admin_table_samples(integer)',
    'public.admin_snapshot_upsert(date)',
    'public.admin_moderation_queue(integer)',
    'public.admin_moderation_sla(integer)',
    'public.admin_liabilities_buckets()',
    'public.admin_payouts_summary()',
    'public.analytics_campaigns(integer)',
    'public.push_coverage()',
    'public.aventa_mark_expired()',
    'public.debug_is_admin_for(uuid)'
  ]
  LOOP
    IF to_regprocedure(v_signature) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END IF;
  END LOOP;
END
$migration$;
