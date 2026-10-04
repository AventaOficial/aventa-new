-- Team OS: racha, misiones, Team Achievements y ranking sobre Team XP.
-- Requiere team_os_memberships.sql, team_xp.sql y team_xp_rules.sql, en ese orden.
-- Toda progresión nace de un resultado de regla `granted` en team_xp_rule_outcomes.
-- No toca el XP de comunidad, achievements de comunidad, user_roles ni dinero.
-- No aplicar a producción desde la app.
-- Forward-only. Sin DROP de tablas ni columnas. La única restricción reemplazada
-- (team_xp_grants_origin_shape) se amplía: todo lo que aceptaba lo sigue aceptando.
-- Rollback conceptual: DROP de las funciones y tablas nuevas y de team_xp_balances.ranked_xp;
-- restaurar la restricción de team_xp_rules.sql. El ledger y los balances no pierden filas.

BEGIN;

-- 1. Orígenes automáticos del ledger ---------------------------------------------------------

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
    OR (
      origin IN ('mission', 'achievement')
      AND rule_id IS NULL
      AND rule_version IS NULL
      AND event_ref IS NOT NULL
      AND amount > 0
    )
  );

-- 2. XP que cuenta para ranking -------------------------------------------------------------
-- ranked_xp solo suma orígenes automáticos (rule, mission, achievement). El XP manual no rankea.

ALTER TABLE public.team_xp_balances
  ADD COLUMN IF NOT EXISTS ranked_xp bigint NOT NULL DEFAULT 0;

ALTER TABLE public.team_xp_balances
  DROP CONSTRAINT IF EXISTS team_xp_balances_ranked_non_negative;
ALTER TABLE public.team_xp_balances
  ADD CONSTRAINT team_xp_balances_ranked_non_negative CHECK (ranked_xp >= 0);

CREATE INDEX IF NOT EXISTS team_xp_balances_rank_idx
  ON public.team_xp_balances (team_id, ranked_xp DESC)
  WHERE ranked_xp > 0;

CREATE TABLE IF NOT EXISTS public.team_xp_daily_totals (
  team_id text NOT NULL REFERENCES public.teams (id),
  day date NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  xp bigint NOT NULL,
  PRIMARY KEY (team_id, day, user_id),
  CONSTRAINT team_xp_daily_totals_positive CHECK (xp > 0)
);

ALTER TABLE public.team_xp_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_daily_totals FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_xp_daily_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.team_xp_daily_totals TO service_role;

-- Backfill idempotente: si team_xp_rules.sql ya concedió XP, el ranking parte de ese ledger.
UPDATE public.team_xp_balances AS b
SET ranked_xp = s.total
FROM (
  SELECT user_id, team_id, sum(amount)::bigint AS total
  FROM public.team_xp_grants
  WHERE origin <> 'manual'
  GROUP BY user_id, team_id
) AS s
WHERE b.user_id = s.user_id AND b.team_id = s.team_id AND b.ranked_xp <> s.total;

INSERT INTO public.team_xp_daily_totals (team_id, day, user_id, xp)
SELECT team_id, (created_at AT TIME ZONE 'America/Mexico_City')::date, user_id, sum(amount)::bigint
FROM public.team_xp_grants
WHERE origin <> 'manual'
GROUP BY team_id, (created_at AT TIME ZONE 'America/Mexico_City')::date, user_id
ON CONFLICT (team_id, day, user_id) DO UPDATE SET xp = EXCLUDED.xp;

-- Único punto que mueve balance + ranking + total diario para XP automático.
CREATE OR REPLACE FUNCTION team_ops.credit_automatic_xp(
  p_user_id uuid,
  p_team_id text,
  p_amount bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_balance bigint;
  v_day date := (now() AT TIME ZONE 'America/Mexico_City')::date;
BEGIN
  IF p_user_id IS NULL OR p_team_id IS NULL OR p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.team_xp_balances (user_id, team_id, balance, ranked_xp)
  VALUES (p_user_id, p_team_id, p_amount, p_amount)
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET balance = public.team_xp_balances.balance + EXCLUDED.balance,
        ranked_xp = public.team_xp_balances.ranked_xp + EXCLUDED.ranked_xp,
        updated_at = now()
  RETURNING balance INTO next_balance;

  INSERT INTO public.team_xp_daily_totals (team_id, day, user_id, xp)
  VALUES (p_team_id, v_day, p_user_id, p_amount)
  ON CONFLICT (team_id, day, user_id) DO UPDATE
    SET xp = public.team_xp_daily_totals.xp + EXCLUDED.xp;

  RETURN next_balance;
END;
$$;

REVOKE ALL ON FUNCTION team_ops.credit_automatic_xp(uuid, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.credit_automatic_xp(uuid, text, bigint) TO service_role;

-- La regla conserva firma y comportamiento; ahora acredita vía credit_automatic_xp.
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

  next_balance := team_ops.credit_automatic_xp(p_user_id, p_team_id, p_amount);

  RETURN jsonb_build_object('status', 'granted', 'balance', next_balance);
END;
$$;

-- 3. Recibo de progresión ------------------------------------------------------------------
-- Marca que racha, misiones y achievements ya se procesaron para un resultado concedido.
-- La reconciliación solo repite resultados concedidos sin recibo.

CREATE TABLE IF NOT EXISTS public.team_xp_progress_receipts (
  source_key text PRIMARY KEY REFERENCES public.team_xp_rule_outcomes (idempotency_key),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.team_xp_progress_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_xp_progress_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_xp_progress_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.team_xp_progress_receipts TO service_role;

DROP TRIGGER IF EXISTS team_xp_progress_receipts_no_mutation ON public.team_xp_progress_receipts;
CREATE TRIGGER team_xp_progress_receipts_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_xp_progress_receipts
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

-- Fuente común: un resultado concedido del mismo usuario y equipo.
CREATE OR REPLACE FUNCTION team_ops.assert_granted_source(
  p_source_key text,
  p_user_id uuid,
  p_team_id text
)
RETURNS public.team_xp_rule_outcomes
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  src public.team_xp_rule_outcomes%ROWTYPE;
BEGIN
  IF p_team_id IS NULL OR p_team_id NOT IN (
    'moderation', 'hunter', 'growth', 'product', 'community', 'operations', 'finance'
  ) THEN
    RAISE EXCEPTION 'invalid_team' USING ERRCODE = 'P0001';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO src FROM public.team_xp_rule_outcomes WHERE idempotency_key = p_source_key;
  IF NOT FOUND OR src.status <> 'granted' OR src.user_id <> p_user_id OR src.team_id <> p_team_id THEN
    RAISE EXCEPTION 'source_not_granted' USING ERRCODE = 'P0001';
  END IF;
  RETURN src;
END;
$$;

REVOKE ALL ON FUNCTION team_ops.assert_granted_source(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.assert_granted_source(text, uuid, text) TO service_role;

-- 4. Racha ---------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.team_activity_days (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  day date NOT NULL,
  source_key text NOT NULL REFERENCES public.team_xp_rule_outcomes (idempotency_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id, day)
);

CREATE TABLE IF NOT EXISTS public.team_streaks (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  current_streak integer NOT NULL,
  longest_streak integer NOT NULL,
  last_activity_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'America/Mexico_City',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, team_id),
  CONSTRAINT team_streaks_shape CHECK (current_streak >= 1 AND longest_streak >= current_streak),
  CONSTRAINT team_streaks_timezone CHECK (timezone = 'America/Mexico_City')
);

ALTER TABLE public.team_activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_activity_days FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_streaks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_activity_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.team_streaks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.team_activity_days TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.team_streaks TO service_role;

DROP TRIGGER IF EXISTS team_activity_days_no_mutation ON public.team_activity_days;
CREATE TRIGGER team_activity_days_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_activity_days
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

CREATE OR REPLACE FUNCTION team_ops.record_team_activity(
  p_user_id uuid,
  p_team_id text,
  p_source_key text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_day date;
  v_rows integer;
  v_last date;
  v_current integer;
  v_longest integer;
  existing public.team_streaks%ROWTYPE;
BEGIN
  PERFORM team_ops.assert_granted_source(p_source_key, p_user_id, p_team_id);
  IF p_occurred_at IS NULL
    OR p_occurred_at < now() - interval '49 hours'
    OR p_occurred_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'stale_event' USING ERRCODE = 'P0001';
  END IF;

  v_day := (p_occurred_at AT TIME ZONE 'America/Mexico_City')::date;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_team_id || ':streak', 0));

  INSERT INTO public.team_activity_days (user_id, team_id, day, source_key)
  VALUES (p_user_id, p_team_id, v_day, p_source_key)
  ON CONFLICT (user_id, team_id, day) DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    SELECT * INTO existing FROM public.team_streaks WHERE user_id = p_user_id AND team_id = p_team_id;
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'current_streak', existing.current_streak,
      'longest_streak', existing.longest_streak,
      'last_activity_date', existing.last_activity_date
    );
  END IF;

  -- Recalcula sobre los días del usuario en el equipo: un evento fuera de orden no rompe la racha.
  WITH d AS (
    SELECT a.day, a.day - (row_number() OVER (ORDER BY a.day))::integer AS grp
    FROM public.team_activity_days a
    WHERE a.user_id = p_user_id AND a.team_id = p_team_id
  ),
  runs AS (
    SELECT max(d.day) AS run_end, count(*)::integer AS run_len
    FROM d
    GROUP BY d.grp
  )
  SELECT r.run_end, r.run_len, (SELECT max(x.run_len) FROM runs x)
  INTO v_last, v_current, v_longest
  FROM runs r
  ORDER BY r.run_end DESC
  LIMIT 1;

  INSERT INTO public.team_streaks (user_id, team_id, current_streak, longest_streak, last_activity_date)
  VALUES (p_user_id, p_team_id, v_current, v_longest, v_last)
  ON CONFLICT (user_id, team_id) DO UPDATE
    SET current_streak = EXCLUDED.current_streak,
        longest_streak = greatest(public.team_streaks.longest_streak, EXCLUDED.longest_streak),
        last_activity_date = EXCLUDED.last_activity_date,
        updated_at = now();

  RETURN jsonb_build_object(
    'status', 'recorded',
    'current_streak', v_current,
    'longest_streak', v_longest,
    'last_activity_date', v_last
  );
END;
$$;

-- 5. Misiones ------------------------------------------------------------------------------
-- La definición vive en código versionado (lib/team/progression/missions/catalog.ts).
-- Aquí solo progreso, eventos contados y completitud.

CREATE TABLE IF NOT EXISTS public.team_mission_progress (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  mission_id text NOT NULL,
  mission_version integer NOT NULL,
  period_key text NOT NULL,
  progress integer NOT NULL,
  target integer NOT NULL,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id, mission_version, period_key),
  CONSTRAINT team_mission_progress_shape CHECK (
    mission_version > 0 AND target > 0 AND progress BETWEEN 0 AND target
    AND (completed_at IS NULL OR progress = target)
  )
);

CREATE INDEX IF NOT EXISTS team_mission_progress_user_team_idx
  ON public.team_mission_progress (user_id, team_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.team_mission_events (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  mission_id text NOT NULL,
  mission_version integer NOT NULL,
  period_key text NOT NULL,
  source_key text NOT NULL REFERENCES public.team_xp_rule_outcomes (idempotency_key),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mission_id, mission_version, period_key, source_key)
);

CREATE TABLE IF NOT EXISTS public.team_mission_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  mission_id text NOT NULL,
  mission_version integer NOT NULL,
  period_key text NOT NULL,
  xp integer NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_mission_completions_once UNIQUE (user_id, mission_id, mission_version, period_key),
  CONSTRAINT team_mission_completions_xp CHECK (xp BETWEEN 0 AND 1000)
);

ALTER TABLE public.team_mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_mission_completions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_mission_progress FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.team_mission_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.team_mission_completions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.team_mission_progress TO service_role;
GRANT SELECT, INSERT ON TABLE public.team_mission_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.team_mission_completions TO service_role;

DROP TRIGGER IF EXISTS team_mission_events_no_mutation ON public.team_mission_events;
CREATE TRIGGER team_mission_events_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_mission_events
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

DROP TRIGGER IF EXISTS team_mission_completions_no_mutation ON public.team_mission_completions;
CREATE TRIGGER team_mission_completions_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_mission_completions
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

CREATE OR REPLACE FUNCTION team_ops.advance_team_mission(
  p_user_id uuid,
  p_team_id text,
  p_mission_id text,
  p_mission_version integer,
  p_period_key text,
  p_source_key text,
  p_target integer,
  p_xp integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows integer;
  v_progress integer;
  v_completed timestamptz;
  v_key text;
  v_completion uuid;
BEGIN
  PERFORM team_ops.assert_granted_source(p_source_key, p_user_id, p_team_id);
  IF p_mission_id IS NULL OR char_length(p_mission_id) > 64
    OR p_mission_id !~ '^[a-z]+\.[a-z0-9_]+$' OR split_part(p_mission_id, '.', 1) <> p_team_id THEN
    RAISE EXCEPTION 'invalid_mission' USING ERRCODE = 'P0001';
  END IF;
  IF p_mission_version IS NULL OR p_mission_version < 1 THEN
    RAISE EXCEPTION 'invalid_mission' USING ERRCODE = 'P0001';
  END IF;
  IF p_period_key IS NULL
    OR p_period_key !~ '^(once|day:\d{4}-\d{2}-\d{2}|week:\d{4}-\d{2}-\d{2}|month:\d{4}-\d{2})$' THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = 'P0001';
  END IF;
  IF p_target IS NULL OR p_target < 1 OR p_target > 1000 THEN
    RAISE EXCEPTION 'invalid_target' USING ERRCODE = 'P0001';
  END IF;
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > 1000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_user_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'recipient_not_active');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_mission_id || ':' || p_mission_version || ':' || p_period_key, 0)
  );

  INSERT INTO public.team_mission_events (user_id, mission_id, mission_version, period_key, source_key)
  VALUES (p_user_id, p_mission_id, p_mission_version, p_period_key, p_source_key)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  SELECT progress, completed_at INTO v_progress, v_completed
  FROM public.team_mission_progress
  WHERE user_id = p_user_id AND mission_id = p_mission_id
    AND mission_version = p_mission_version AND period_key = p_period_key;

  IF FOUND AND v_completed IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_completed', 'progress', v_progress, 'target', p_target);
  END IF;

  v_progress := least(p_target, coalesce(v_progress, 0) + 1);
  INSERT INTO public.team_mission_progress (
    user_id, team_id, mission_id, mission_version, period_key, progress, target, completed_at
  ) VALUES (
    p_user_id, p_team_id, p_mission_id, p_mission_version, p_period_key, v_progress, p_target,
    CASE WHEN v_progress >= p_target THEN now() ELSE NULL END
  )
  ON CONFLICT (user_id, mission_id, mission_version, period_key) DO UPDATE
    SET progress = EXCLUDED.progress,
        completed_at = EXCLUDED.completed_at,
        updated_at = now();

  IF v_progress < p_target THEN
    RETURN jsonb_build_object('status', 'progressed', 'progress', v_progress, 'target', p_target);
  END IF;

  v_key := 'team-mission:' || p_mission_id || ':v' || p_mission_version || ':' || p_period_key || ':' || p_user_id::text;
  INSERT INTO public.team_mission_completions (
    user_id, team_id, mission_id, mission_version, period_key, xp, idempotency_key
  ) VALUES (
    p_user_id, p_team_id, p_mission_id, p_mission_version, p_period_key, p_xp, v_key
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_completion;

  IF v_completion IS NULL THEN
    RETURN jsonb_build_object('status', 'already_completed', 'progress', v_progress, 'target', p_target);
  END IF;

  IF p_xp > 0 THEN
    INSERT INTO public.team_xp_grants (
      user_id, team_id, amount, source, idempotency_key, actor_id, metadata, origin, event_ref
    ) VALUES (
      p_user_id, p_team_id, p_xp, p_mission_id, v_key, p_user_id,
      jsonb_build_object('mission_version', p_mission_version, 'period_key', p_period_key),
      'mission', p_source_key
    );
    PERFORM team_ops.credit_automatic_xp(p_user_id, p_team_id, p_xp);
  END IF;

  RETURN jsonb_build_object('status', 'completed', 'progress', v_progress, 'target', p_target, 'xp', p_xp);
END;
$$;

-- 6. Team Achievements ---------------------------------------------------------------------
-- Separado de los achievements de comunidad. Una vez por (user_id, team_id, achievement_key).

CREATE TABLE IF NOT EXISTS public.team_achievement_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  achievement_key text NOT NULL,
  achievement_version integer NOT NULL,
  criteria jsonb NOT NULL,
  xp integer NOT NULL,
  source_key text NOT NULL REFERENCES public.team_xp_rule_outcomes (idempotency_key),
  idempotency_key text NOT NULL UNIQUE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_achievement_awards_once UNIQUE (user_id, team_id, achievement_key),
  CONSTRAINT team_achievement_awards_shape CHECK (achievement_version > 0 AND xp BETWEEN 0 AND 1000)
);

ALTER TABLE public.team_achievement_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_achievement_awards FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.team_achievement_awards FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.team_achievement_awards TO service_role;

DROP TRIGGER IF EXISTS team_achievement_awards_no_mutation ON public.team_achievement_awards;
CREATE TRIGGER team_achievement_awards_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_achievement_awards
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_team_xp_grant_mutation();

-- El criterio se verifica aquí contra el ledger o la racha; el llamador no puede afirmarlo.
CREATE OR REPLACE FUNCTION team_ops.award_team_achievement(
  p_user_id uuid,
  p_team_id text,
  p_achievement_key text,
  p_achievement_version integer,
  p_criteria_kind text,
  p_criteria_rule_id text,
  p_threshold integer,
  p_xp integer,
  p_source_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_metric bigint;
  v_key text;
  v_award uuid;
BEGIN
  PERFORM team_ops.assert_granted_source(p_source_key, p_user_id, p_team_id);
  IF p_achievement_key IS NULL OR char_length(p_achievement_key) > 64
    OR p_achievement_key !~ '^[a-z]+\.[a-z0-9_]+$' OR split_part(p_achievement_key, '.', 1) <> p_team_id THEN
    RAISE EXCEPTION 'invalid_achievement' USING ERRCODE = 'P0001';
  END IF;
  IF p_achievement_version IS NULL OR p_achievement_version < 1 THEN
    RAISE EXCEPTION 'invalid_achievement' USING ERRCODE = 'P0001';
  END IF;
  IF p_threshold IS NULL OR p_threshold < 1 OR p_threshold > 100000 THEN
    RAISE EXCEPTION 'invalid_threshold' USING ERRCODE = 'P0001';
  END IF;
  IF p_xp IS NULL OR p_xp < 0 OR p_xp > 1000 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = 'P0001';
  END IF;
  IF p_criteria_kind = 'rule_grants' THEN
    IF p_criteria_rule_id IS NULL OR split_part(p_criteria_rule_id, '.', 1) <> p_team_id THEN
      RAISE EXCEPTION 'invalid_criteria' USING ERRCODE = 'P0001';
    END IF;
  ELSIF p_criteria_kind = 'longest_streak' THEN
    IF p_criteria_rule_id IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_criteria' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid_criteria' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_user_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'recipient_not_active');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':' || p_team_id || ':' || p_achievement_key, 0)
  );

  IF EXISTS (
    SELECT 1 FROM public.team_achievement_awards
    WHERE user_id = p_user_id AND team_id = p_team_id AND achievement_key = p_achievement_key
  ) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF p_criteria_kind = 'rule_grants' THEN
    SELECT count(*) INTO v_metric
    FROM public.team_xp_grants
    WHERE user_id = p_user_id AND team_id = p_team_id
      AND rule_id = p_criteria_rule_id AND origin = 'rule';
  ELSE
    SELECT coalesce(max(longest_streak), 0) INTO v_metric
    FROM public.team_streaks
    WHERE user_id = p_user_id AND team_id = p_team_id;
  END IF;

  IF v_metric < p_threshold THEN
    RETURN jsonb_build_object('status', 'not_met', 'metric', v_metric, 'threshold', p_threshold);
  END IF;

  v_key := 'team-achievement:' || p_achievement_key || ':' || p_user_id::text;
  INSERT INTO public.team_achievement_awards (
    user_id, team_id, achievement_key, achievement_version, criteria, xp, source_key, idempotency_key
  ) VALUES (
    p_user_id, p_team_id, p_achievement_key, p_achievement_version,
    jsonb_build_object('kind', p_criteria_kind, 'rule_id', p_criteria_rule_id, 'threshold', p_threshold),
    p_xp, p_source_key, v_key
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_award;

  IF v_award IS NULL THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF p_xp > 0 THEN
    INSERT INTO public.team_xp_grants (
      user_id, team_id, amount, source, idempotency_key, actor_id, metadata, origin, event_ref
    ) VALUES (
      p_user_id, p_team_id, p_xp, p_achievement_key, v_key, p_user_id,
      jsonb_build_object('achievement_version', p_achievement_version),
      'achievement', p_source_key
    );
    PERFORM team_ops.credit_automatic_xp(p_user_id, p_team_id, p_xp);
  END IF;

  RETURN jsonb_build_object('status', 'awarded', 'xp', p_xp);
END;
$$;

-- 7. Ranking -------------------------------------------------------------------------------
-- Solo XP automático (ranked_xp / team_xp_daily_totals) y solo membresías ACTIVE.
-- Nunca lee profiles.achievement_xp: el XP de comunidad no entra en ningún ranking de equipo.

CREATE OR REPLACE FUNCTION team_ops.leaderboard_period_start(p_period text, p_today date)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_period
    WHEN 'daily' THEN p_today
    WHEN 'weekly' THEN p_today - (extract(isodow FROM p_today)::integer - 1)
    WHEN 'monthly' THEN make_date(extract(year FROM p_today)::integer, extract(month FROM p_today)::integer, 1)
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION team_ops.team_leaderboard(
  p_team_id text,
  p_period text,
  p_limit integer
)
RETURNS TABLE (rank_position bigint, member_id uuid, display_name text, xp bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_start date;
BEGIN
  IF p_team_id IS NULL OR p_team_id NOT IN (
    'moderation', 'hunter', 'growth', 'product', 'community', 'operations', 'finance'
  ) THEN
    RAISE EXCEPTION 'invalid_team' USING ERRCODE = 'P0001';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('daily', 'weekly', 'monthly', 'all_time') THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = 'P0001';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'invalid_limit' USING ERRCODE = 'P0001';
  END IF;

  IF p_period = 'all_time' THEN
    RETURN QUERY
    SELECT rank() OVER (ORDER BY b.ranked_xp DESC), b.user_id, p.display_name::text, b.ranked_xp
    FROM public.team_xp_balances b
    JOIN public.team_memberships m
      ON m.user_id = b.user_id AND m.team_id = b.team_id AND m.status = 'ACTIVE'
    LEFT JOIN public.profiles p ON p.id = b.user_id
    WHERE b.team_id = p_team_id AND b.ranked_xp > 0
    ORDER BY b.ranked_xp DESC, b.user_id
    LIMIT p_limit;
    RETURN;
  END IF;

  v_start := team_ops.leaderboard_period_start(p_period, v_today);
  RETURN QUERY
  WITH totals AS (
    SELECT d.user_id AS uid, sum(d.xp)::bigint AS total
    FROM public.team_xp_daily_totals d
    WHERE d.team_id = p_team_id AND d.day BETWEEN v_start AND v_today
    GROUP BY d.user_id
  )
  SELECT rank() OVER (ORDER BY t.total DESC), t.uid, p.display_name::text, t.total
  FROM totals t
  JOIN public.team_memberships m
    ON m.user_id = t.uid AND m.team_id = p_team_id AND m.status = 'ACTIVE'
  LEFT JOIN public.profiles p ON p.id = t.uid
  WHERE t.total > 0
  ORDER BY t.total DESC, t.uid
  LIMIT p_limit;
END;
$$;

-- Posición propia sin descargar el ranking: una cuenta de quién tiene más XP.
CREATE OR REPLACE FUNCTION team_ops.team_leaderboard_position(
  p_team_id text,
  p_period text,
  p_user_id uuid
)
RETURNS TABLE (rank_position bigint, xp bigint, ranked_members bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
#variable_conflict use_column
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Mexico_City')::date;
  v_start date;
  v_xp bigint;
  v_above bigint;
  v_total bigint;
BEGIN
  IF p_team_id IS NULL OR p_team_id NOT IN (
    'moderation', 'hunter', 'growth', 'product', 'community', 'operations', 'finance'
  ) THEN
    RAISE EXCEPTION 'invalid_team' USING ERRCODE = 'P0001';
  END IF;
  IF p_period IS NULL OR p_period NOT IN ('daily', 'weekly', 'monthly', 'all_time') THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = 'P0001';
  END IF;
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.team_memberships
    WHERE user_id = p_user_id AND team_id = p_team_id AND status = 'ACTIVE'
  ) THEN
    RETURN;
  END IF;

  IF p_period = 'all_time' THEN
    SELECT coalesce(max(b.ranked_xp), 0) INTO v_xp
    FROM public.team_xp_balances b
    WHERE b.user_id = p_user_id AND b.team_id = p_team_id;

    SELECT count(*) FILTER (WHERE b.ranked_xp > v_xp), count(*)
    INTO v_above, v_total
    FROM public.team_xp_balances b
    JOIN public.team_memberships m
      ON m.user_id = b.user_id AND m.team_id = b.team_id AND m.status = 'ACTIVE'
    WHERE b.team_id = p_team_id AND b.ranked_xp > 0;
  ELSE
    v_start := team_ops.leaderboard_period_start(p_period, v_today);
    SELECT coalesce(sum(d.xp), 0)::bigint INTO v_xp
    FROM public.team_xp_daily_totals d
    WHERE d.team_id = p_team_id AND d.user_id = p_user_id AND d.day BETWEEN v_start AND v_today;

    WITH totals AS (
      SELECT d.user_id AS uid, sum(d.xp)::bigint AS total
      FROM public.team_xp_daily_totals d
      WHERE d.team_id = p_team_id AND d.day BETWEEN v_start AND v_today
      GROUP BY d.user_id
    )
    SELECT count(*) FILTER (WHERE t.total > v_xp), count(*)
    INTO v_above, v_total
    FROM totals t
    JOIN public.team_memberships m
      ON m.user_id = t.uid AND m.team_id = p_team_id AND m.status = 'ACTIVE'
    WHERE t.total > 0;
  END IF;

  RETURN QUERY SELECT
    CASE WHEN v_xp > 0 THEN v_above + 1 ELSE NULL END,
    v_xp,
    v_total;
END;
$$;

-- 8. Permisos y wrappers públicos (service_role, SECURITY INVOKER) ------------------------

REVOKE ALL ON FUNCTION team_ops.record_team_activity(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.advance_team_mission(uuid, text, text, integer, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.award_team_achievement(uuid, text, text, integer, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.leaderboard_period_start(text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_leaderboard(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_leaderboard_position(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION team_ops.record_team_activity(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.advance_team_mission(uuid, text, text, integer, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.award_team_achievement(uuid, text, text, integer, text, text, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.leaderboard_period_start(text, date) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_leaderboard(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_leaderboard_position(text, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.record_team_activity(
  p_user_id uuid,
  p_team_id text,
  p_source_key text,
  p_occurred_at timestamptz
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.record_team_activity(p_user_id, p_team_id, p_source_key, p_occurred_at);
$$;

CREATE OR REPLACE FUNCTION public.advance_team_mission(
  p_user_id uuid,
  p_team_id text,
  p_mission_id text,
  p_mission_version integer,
  p_period_key text,
  p_source_key text,
  p_target integer,
  p_xp integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.advance_team_mission(
    p_user_id, p_team_id, p_mission_id, p_mission_version, p_period_key, p_source_key, p_target, p_xp
  );
$$;

CREATE OR REPLACE FUNCTION public.award_team_achievement(
  p_user_id uuid,
  p_team_id text,
  p_achievement_key text,
  p_achievement_version integer,
  p_criteria_kind text,
  p_criteria_rule_id text,
  p_threshold integer,
  p_xp integer,
  p_source_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.award_team_achievement(
    p_user_id, p_team_id, p_achievement_key, p_achievement_version,
    p_criteria_kind, p_criteria_rule_id, p_threshold, p_xp, p_source_key
  );
$$;

CREATE OR REPLACE FUNCTION public.team_leaderboard(p_team_id text, p_period text, p_limit integer)
RETURNS TABLE (rank_position bigint, member_id uuid, display_name text, xp bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT * FROM team_ops.team_leaderboard(p_team_id, p_period, p_limit);
$$;

CREATE OR REPLACE FUNCTION public.team_leaderboard_position(p_team_id text, p_period text, p_user_id uuid)
RETURNS TABLE (rank_position bigint, xp bigint, ranked_members bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT * FROM team_ops.team_leaderboard_position(p_team_id, p_period, p_user_id);
$$;

REVOKE ALL ON FUNCTION public.record_team_activity(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_team_mission(uuid, text, text, integer, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_team_achievement(uuid, text, text, integer, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_leaderboard(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_leaderboard_position(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_team_activity(uuid, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_team_mission(uuid, text, text, integer, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.award_team_achievement(uuid, text, text, integer, text, text, integer, integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_leaderboard(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_leaderboard_position(text, text, uuid) TO service_role;

COMMIT;
