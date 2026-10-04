-- Team XP: ledger inmutable + acumulado por usuario y equipo.
-- No toca el XP de comunidad, achievements, user_roles ni team_memberships.
-- No aplicar a producción desde la app.
-- Rollback conceptual: DROP de estas funciones, triggers y tablas. El XP de comunidad no se modifica.
-- Escrituras: solo service_role, vía team_ops.grant_team_xp. authenticated no tiene policies ni EXECUTE.

BEGIN;

CREATE TABLE IF NOT EXISTS public.team_xp_balances (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id),
  CONSTRAINT team_xp_balances_non_negative CHECK (balance >= 0)
);

CREATE TABLE IF NOT EXISTS public.team_xp_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  amount bigint NOT NULL,
  source text NOT NULL,
  idempotency_key text NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_xp_grants_amount_check CHECK (amount <> 0 AND amount BETWEEN -10000 AND 10000),
  CONSTRAINT team_xp_grants_source_check CHECK (
    (source = 'compensation' AND amount < 0)
    OR (source <> 'compensation' AND amount > 0)
  ),
  CONSTRAINT team_xp_grants_key_check CHECK (
    char_length(idempotency_key) BETWEEN 8 AND 160
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS team_xp_grants_idempotency_key
  ON public.team_xp_grants (idempotency_key);

CREATE INDEX IF NOT EXISTS team_xp_grants_history_idx
  ON public.team_xp_grants (user_id, team_id, created_at DESC);

ALTER TABLE public.team_xp_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_balances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_grants FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.team_xp_balances FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.team_xp_grants FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.team_xp_balances TO service_role;
GRANT SELECT, INSERT ON TABLE public.team_xp_grants TO service_role;

CREATE OR REPLACE FUNCTION team_ops.reject_team_xp_grant_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'team_xp_grant_immutable' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS team_xp_grants_no_mutation ON public.team_xp_grants;
CREATE TRIGGER team_xp_grants_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_xp_grants
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

CREATE OR REPLACE FUNCTION team_ops.grant_team_xp(
  p_actor_id uuid,
  p_user_id uuid,
  p_team_id text,
  p_amount bigint,
  p_source text,
  p_idempotency_key text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing public.team_xp_grants%ROWTYPE;
  inserted_id uuid;
  next_balance bigint;
BEGIN
  IF p_actor_id IS NULL OR p_user_id IS NULL OR p_team_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  IF p_actor_id = p_user_id THEN
    RAISE EXCEPTION 'self_grant' USING ERRCODE = 'P0001';
  END IF;
  IF p_team_id NOT IN (
    'moderation', 'hunter', 'growth', 'product', 'community', 'operations', 'finance'
  ) THEN
    RAISE EXCEPTION 'invalid_team' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount = 0 OR p_amount > 10000 OR p_amount < -10000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_source IS NULL OR char_length(p_source) < 3 OR char_length(p_source) > 64 THEN
    RAISE EXCEPTION 'invalid_source' USING ERRCODE = 'P0001';
  END IF;
  IF p_source = 'compensation' THEN
    IF p_amount >= 0 OR coalesce(p_metadata->>'compensates_key', '') = '' THEN
      RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_amount < 0 OR p_source = 'compensation' THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) < 8 OR char_length(p_idempotency_key) > 160 THEN
    RAISE EXCEPTION 'invalid_key' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_actor_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'actor_not_active' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_user_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'recipient_not_active' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.team_xp_grants (
    user_id, team_id, amount, source, idempotency_key, actor_id, metadata
  ) VALUES (
    p_user_id, p_team_id, p_amount, p_source, p_idempotency_key, p_actor_id, coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO inserted_id;

  IF inserted_id IS NULL THEN
    SELECT * INTO existing
    FROM public.team_xp_grants
    WHERE idempotency_key = p_idempotency_key;
    IF existing.user_id <> p_user_id
      OR existing.team_id <> p_team_id
      OR existing.amount <> p_amount
      OR existing.source <> p_source
      OR existing.actor_id <> p_actor_id THEN
      RAISE EXCEPTION 'idempotency_conflict' USING ERRCODE = 'P0001';
    END IF;
    SELECT balance INTO next_balance
    FROM public.team_xp_balances
    WHERE user_id = p_user_id AND team_id = p_team_id;
    RETURN jsonb_build_object('applied', false, 'balance', coalesce(next_balance, 0));
  END IF;

  INSERT INTO public.team_xp_balances (user_id, team_id, balance)
  VALUES (p_user_id, p_team_id, p_amount)
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET balance = public.team_xp_balances.balance + EXCLUDED.balance,
        updated_at = now()
    WHERE public.team_xp_balances.balance + EXCLUDED.balance >= 0
  RETURNING balance INTO next_balance;

  IF next_balance IS NULL THEN
    RAISE EXCEPTION 'balance_underflow' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object('applied', true, 'balance', next_balance);
END;
$$;

REVOKE ALL ON FUNCTION team_ops.reject_team_xp_grant_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.reject_team_xp_grant_mutation() TO service_role;
REVOKE ALL ON FUNCTION team_ops.grant_team_xp(uuid, uuid, text, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.grant_team_xp(uuid, uuid, text, bigint, text, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.grant_team_xp(
  p_actor_id uuid,
  p_user_id uuid,
  p_team_id text,
  p_amount bigint,
  p_source text,
  p_idempotency_key text,
  p_metadata jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.grant_team_xp(
    p_actor_id, p_user_id, p_team_id, p_amount, p_source, p_idempotency_key, p_metadata
  );
$$;

REVOKE ALL ON FUNCTION public.grant_team_xp(uuid, uuid, text, bigint, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_team_xp(uuid, uuid, text, bigint, text, text, jsonb) TO service_role;

COMMIT;
