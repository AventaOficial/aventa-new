-- =============================================================================
-- AVENTA Production Ready — Revoke EXECUTE on sensitive SECURITY DEFINER RPCs
-- =============================================================================
-- Problema: anon/authenticated podían llamar vía /rest/v1/rpc funciones que
-- incrementan reputación, recalculan métricas o hacen upsert de actividad.
-- La app ya las invoca solo con service_role (createServerClient en APIs).
--
-- Conservar EXECUTE para authenticated en helpers usados por RLS:
--   is_moderator(), user_has_moderation_role()
-- =============================================================================

BEGIN;

-- Helpers RLS: authenticated sí; anon no (policies son para authenticated)
REVOKE EXECUTE ON FUNCTION public.is_moderator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_moderator() TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.user_has_moderation_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_moderation_role() TO authenticated, service_role;

-- Mutadores / recalculadores / triggers expuestos como RPC: solo service_role
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
        'get_profile_by_slug',
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

COMMIT;

-- Verificación esperada (correr aparte):
-- SELECT proname, has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec,
--        has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec
-- FROM pg_proc WHERE proname IN ('increment_offers_approved_count','is_moderator','recalculate_user_reputation');
