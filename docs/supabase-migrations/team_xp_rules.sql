-- Team XP por reglas. Requiere team_os_memberships.sql y team_xp.sql.
-- Cada evaluación de una regla deja un resultado inmutable con su clave.
-- Un resultado concedido inserta el grant y mueve el acumulado en la misma transacción.
-- No toca el XP de comunidad, achievements, user_roles ni dinero.
-- No aplicar a producción desde la app.
-- Rollback conceptual: DROP de las funciones, triggers, team_xp_rule_outcomes y de las
-- columnas añadidas a team_xp_grants. Los grants manuales no dependen de ellas.

BEGIN;

ALTER TABLE public.team_xp_grants
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS rule_id text,
  ADD COLUMN IF NOT EXISTS rule_version integer,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS event_ref text;

ALTER TABLE public.team_xp_grants
  DROP CONSTRAINT IF EXISTS team_xp_grants_origin_shape;
ALTER TABLE public.team_xp_grants
  ADD CONSTRAINT team_xp_grants_origin_shape CHECK (
    (
      origin = 'rule'
      AND rule_id IS NOT NULL
      AND rule_version IS NOT NULL
      AND rule_version > 0
      AND event_type IS NOT NULL
      AND event_ref IS NOT NULL
      AND amount > 0
    )
    OR (
      origin = 'manual'
      AND rule_id IS NULL
      AND rule_version IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS team_xp_grants_rule_day_idx
  ON public.team_xp_grants (user_id, team_id, rule_id, created_at DESC)
  WHERE origin = 'rule';

CREATE TABLE IF NOT EXISTS public.team_xp_rule_outcomes (
  idempotency_key text PRIMARY KEY,
  rule_id text NOT NULL,
  rule_version integer NOT NULL,
  team_id text NOT NULL REFERENCES public.teams (id),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  event_ref text NOT NULL,
  status text NOT NULL,
  reason text,
  amount bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_xp_rule_outcomes_status_check CHECK (status IN ('granted', 'skipped')),
  CONSTRAINT team_xp_rule_outcomes_shape CHECK (
    (status = 'granted' AND reason IS NULL AND amount > 0)
    OR (status = 'skipped' AND reason IS NOT NULL AND amount = 0)
  ),
  CONSTRAINT team_xp_rule_outcomes_version_check CHECK (rule_version > 0)
);

CREATE INDEX IF NOT EXISTS team_xp_rule_outcomes_user_idx
  ON public.team_xp_rule_outcomes (user_id, team_id, created_at DESC);

ALTER TABLE public.team_xp_rule_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_rule_outcomes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_xp_rule_outcomes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.team_xp_rule_outcomes TO service_role;

DROP TRIGGER IF EXISTS team_xp_rule_outcomes_no_mutation ON public.team_xp_rule_outcomes;
CREATE TRIGGER team_xp_rule_outcomes_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_xp_rule_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

CREATE OR REPLACE FUNCTION team_ops.apply_team_xp_rule(
  p_actor_id uuid,
  p_user_id uuid,
  p_team_id text,
  p_rule_id text,
  p_rule_version integer,
  p_event_type text,
  p_event_ref text,
  p_idempotency_key text,
  p_amount bigint,
  p_daily_cap integer,
  p_skip_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  existing public.team_xp_rule_outcomes%ROWTYPE;
  inserted_key text;
  decided_status text;
  decided_reason text;
  today_start timestamptz;
  granted_today integer;
  next_balance bigint;
BEGIN
  IF p_actor_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  IF p_team_id NOT IN (
    'moderation', 'hunter', 'growth', 'product', 'community', 'operations', 'finance'
  ) THEN
    RAISE EXCEPTION 'invalid_team' USING ERRCODE = 'P0001';
  END IF;
  IF p_rule_id IS NULL OR p_rule_id !~ '^[a-z]+\.[a-z0-9_]+$' OR split_part(p_rule_id, '.', 1) <> p_team_id THEN
    RAISE EXCEPTION 'invalid_rule' USING ERRCODE = 'P0001';
  END IF;
  IF p_rule_version IS NULL OR p_rule_version < 1 THEN
    RAISE EXCEPTION 'invalid_rule' USING ERRCODE = 'P0001';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_daily_cap IS NULL OR p_daily_cap < 1 OR p_daily_cap > 10000 THEN
    RAISE EXCEPTION 'invalid_cap' USING ERRCODE = 'P0001';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) < 8 OR char_length(p_idempotency_key) > 160 THEN
    RAISE EXCEPTION 'invalid_key' USING ERRCODE = 'P0001';
  END IF;
  IF p_event_type IS NULL OR p_event_ref IS NULL OR char_length(p_event_ref) > 120 THEN
    RAISE EXCEPTION 'invalid_event' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO existing FROM public.team_xp_rule_outcomes WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'duplicate', 'previous', existing.status, 'reason', existing.reason);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_team_id || ':' || p_rule_id, 0));

  IF p_skip_reason IS NOT NULL THEN
    decided_status := 'skipped';
    decided_reason := left(p_skip_reason, 64);
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_user_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    decided_status := 'skipped';
    decided_reason := 'recipient_not_active';
  ELSE
    today_start := (date_trunc('day', now() AT TIME ZONE 'America/Mexico_City')) AT TIME ZONE 'America/Mexico_City';
    SELECT count(*) INTO granted_today
    FROM public.team_xp_grants
    WHERE user_id = p_user_id
      AND team_id = p_team_id
      AND rule_id = p_rule_id
      AND origin = 'rule'
      AND created_at >= today_start;
    IF granted_today >= p_daily_cap THEN
      decided_status := 'skipped';
      decided_reason := 'daily_cap';
    ELSE
      decided_status := 'granted';
      decided_reason := NULL;
    END IF;
  END IF;

  INSERT INTO public.team_xp_rule_outcomes (
    idempotency_key, rule_id, rule_version, team_id, user_id, actor_id,
    event_type, event_ref, status, reason, amount
  ) VALUES (
    p_idempotency_key, p_rule_id, p_rule_version, p_team_id, p_user_id, p_actor_id,
    p_event_type, p_event_ref, decided_status, decided_reason,
    CASE WHEN decided_status = 'granted' THEN p_amount ELSE 0 END
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING idempotency_key INTO inserted_key;

  IF inserted_key IS NULL THEN
    SELECT * INTO existing FROM public.team_xp_rule_outcomes WHERE idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('status', 'duplicate', 'previous', existing.status, 'reason', existing.reason);
  END IF;

  IF decided_status = 'skipped' THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', decided_reason);
  END IF;

  INSERT INTO public.team_xp_grants (
    user_id, team_id, amount, source, idempotency_key, actor_id, metadata,
    origin, rule_id, rule_version, event_type, event_ref
  ) VALUES (
    p_user_id, p_team_id, p_amount, p_rule_id, p_idempotency_key, p_actor_id, '{}'::jsonb,
    'rule', p_rule_id, p_rule_version, p_event_type, p_event_ref
  );

  INSERT INTO public.team_xp_balances (user_id, team_id, balance)
  VALUES (p_user_id, p_team_id, p_amount)
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET balance = public.team_xp_balances.balance + EXCLUDED.balance,
        updated_at = now()
  RETURNING balance INTO next_balance;

  RETURN jsonb_build_object('status', 'granted', 'balance', next_balance);
END;
$$;

REVOKE ALL ON FUNCTION team_ops.apply_team_xp_rule(uuid, uuid, text, text, integer, text, text, text, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.apply_team_xp_rule(uuid, uuid, text, text, integer, text, text, text, bigint, integer, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_team_xp_rule(
  p_actor_id uuid,
  p_user_id uuid,
  p_team_id text,
  p_rule_id text,
  p_rule_version integer,
  p_event_type text,
  p_event_ref text,
  p_idempotency_key text,
  p_amount bigint,
  p_daily_cap integer,
  p_skip_reason text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.apply_team_xp_rule(
    p_actor_id, p_user_id, p_team_id, p_rule_id, p_rule_version, p_event_type,
    p_event_ref, p_idempotency_key, p_amount, p_daily_cap, p_skip_reason
  );
$$;

REVOKE ALL ON FUNCTION public.apply_team_xp_rule(uuid, uuid, text, text, integer, text, text, text, bigint, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_team_xp_rule(uuid, uuid, text, text, integer, text, text, text, bigint, integer, text) TO service_role;

COMMIT;
