-- Fija search_path en las dos funciones que el advisor marca como mutables y
-- retira EXECUTE de anon/authenticated en la lista de reversos de liquidación.
--
-- Idempotente: ALTER ... SET y REVOKE se pueden repetir. Si la función no existe
-- (staging sin rewards_v1), se omite.
--
-- No cambia el cuerpo de ninguna función ni toca filas.
-- - list_pending_settlement_reversal_commissions: solo usa nombres public.* calificados.
--   20260930_pending_settlement_reversal_recovery.sql ya pretendía solo service_role, pero
--   REVOKE ... FROM PUBLIC no quita el EXECUTE explícito que Supabase concede por defecto.
--   Único llamador: lib/economy/settlement/reversalRecoveryDispatch.ts con service_role.
-- - reputation_level_from_score: CASE puro sin tablas; conserva sus grants.

DO $$
BEGIN
  IF to_regprocedure('public.list_pending_settlement_reversal_commissions(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.list_pending_settlement_reversal_commissions(integer) SET search_path = '';
    REVOKE EXECUTE ON FUNCTION public.list_pending_settlement_reversal_commissions(integer) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.list_pending_settlement_reversal_commissions(integer) TO service_role;
  END IF;

  IF to_regprocedure('public.reputation_level_from_score(integer)') IS NOT NULL THEN
    ALTER FUNCTION public.reputation_level_from_score(integer) SET search_path = '';
  END IF;
END
$$;

-- Verificación (solo lectura):
-- SELECT p.oid::regprocedure, p.proconfig, p.proacl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('list_pending_settlement_reversal_commissions', 'reputation_level_from_score');
