-- Team OS: equipos, membresías y auditoría.
-- No toca user_roles. No migra moderator, finance, marketing, analyst, gerente ni admin.
-- No aplicar a producción desde la app. Ejecutar a mano cuando se decida el entorno.
-- Escrituras: solo service_role, vía funciones. authenticated no tiene policies ni EXECUTE.

BEGIN;

CREATE SCHEMA IF NOT EXISTS team_ops;

REVOKE ALL ON SCHEMA team_ops FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA team_ops TO service_role;

CREATE TABLE IF NOT EXISTS public.teams (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_id_check CHECK (
    id IN (
      'moderation',
      'hunter',
      'growth',
      'product',
      'community',
      'operations',
      'finance'
    )
  )
);

INSERT INTO public.teams (id, name, description) VALUES
  ('moderation', 'Moderación', 'Cola de ofertas y reportes'),
  ('hunter', 'Hunter', 'Hallazgos y lotes'),
  ('growth', 'Growth', 'Crecimiento'),
  ('product', 'Producto', 'Producto'),
  ('community', 'Comunidad', 'Comunidad'),
  ('operations', 'Operaciones', 'Operación del sitio'),
  ('finance', 'Finanzas', 'Lectura de finanzas')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION team_ops.role_allowed(p_team text, p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_team = 'moderation' AND p_role IN ('moderator', 'senior_moderator', 'moderation_lead') THEN true
    WHEN p_team = 'hunter' AND p_role IN ('hunter', 'hunter_lead') THEN true
    WHEN p_team = 'finance' AND p_role IN ('finance_viewer') THEN true
    WHEN p_team = 'growth' AND p_role IN ('growth_member', 'growth_lead') THEN true
    WHEN p_team = 'product' AND p_role IN ('product_member', 'product_lead') THEN true
    WHEN p_team = 'community' AND p_role IN ('community_member', 'community_lead') THEN true
    WHEN p_team = 'operations' AND p_role IN ('operations_member', 'operations_lead') THEN true
    ELSE false
  END;
$$;

CREATE TABLE IF NOT EXISTS public.team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  role text NOT NULL,
  status text NOT NULL,
  assigned_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  status_changed_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  removed_at timestamptz,
  CONSTRAINT team_memberships_status_check CHECK (status IN ('ACTIVE', 'SUSPENDED', 'REMOVED')),
  CONSTRAINT team_memberships_removed_at_check CHECK (
    (status = 'REMOVED' AND removed_at IS NOT NULL)
    OR (status <> 'REMOVED' AND removed_at IS NULL)
  ),
  CONSTRAINT team_memberships_role_for_team CHECK (team_ops.role_allowed(team_id, role))
);

CREATE UNIQUE INDEX IF NOT EXISTS team_memberships_one_live
  ON public.team_memberships (user_id, team_id)
  WHERE status IN ('ACTIVE', 'SUSPENDED');

CREATE INDEX IF NOT EXISTS team_memberships_user_idx
  ON public.team_memberships (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.team_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  target_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  team_id text NOT NULL REFERENCES public.teams (id),
  action text NOT NULL,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT team_audit_log_action_check CHECK (
    action IN (
      'TEAM_MEMBER_ADDED',
      'TEAM_ROLE_CHANGED',
      'TEAM_MEMBERSHIP_SUSPENDED',
      'TEAM_MEMBERSHIP_REACTIVATED',
      'TEAM_MEMBER_REMOVED'
    )
  )
);

CREATE INDEX IF NOT EXISTS team_audit_log_created_idx
  ON public.team_audit_log (created_at DESC);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.teams FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.team_memberships FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.team_audit_log FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.teams TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.team_memberships TO service_role;
GRANT SELECT, INSERT ON TABLE public.team_audit_log TO service_role;

CREATE OR REPLACE FUNCTION team_ops.reject_membership_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'membership_delete_forbidden' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS team_memberships_no_delete ON public.team_memberships;
CREATE TRIGGER team_memberships_no_delete
  BEFORE DELETE ON public.team_memberships
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_membership_delete();

CREATE OR REPLACE FUNCTION team_ops.reject_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'audit_append_only' USING ERRCODE = 'P0001';
END;
$$;

DROP TRIGGER IF EXISTS team_audit_log_no_mutation ON public.team_audit_log;
CREATE TRIGGER team_audit_log_no_mutation
  BEFORE UPDATE OR DELETE ON public.team_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION team_ops.reject_audit_mutation();

CREATE OR REPLACE FUNCTION team_ops.assert_owner(p_actor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = p_actor_id AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION team_ops.team_assign_member(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_team_id text,
  p_role text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  live public.team_memberships%ROWTYPE;
  new_id uuid;
  audit_id uuid;
  clean_reason text;
BEGIN
  PERFORM team_ops.assert_owner(p_actor_id);
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION 'self_assignment' USING ERRCODE = 'P0001';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'target_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id) THEN
    RAISE EXCEPTION 'unknown_team' USING ERRCODE = 'P0001';
  END IF;
  IF NOT team_ops.role_allowed(p_team_id, p_role) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = 'P0001';
  END IF;
  clean_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'reason_invalid' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_target_user_id::text || ':' || p_team_id));

  SELECT * INTO live
  FROM public.team_memberships
  WHERE user_id = p_target_user_id
    AND team_id = p_team_id
    AND status IN ('ACTIVE', 'SUSPENDED')
  FOR UPDATE;

  IF FOUND THEN
    IF live.status = 'ACTIVE' AND live.role = p_role THEN
      RETURN jsonb_build_object(
        'ok', true,
        'membership_id', live.id,
        'audit_id', NULL,
        'idempotent', true
      );
    END IF;
    RAISE EXCEPTION 'live_membership_exists' USING ERRCODE = 'P0001';
  END IF;

  BEGIN
    INSERT INTO public.team_memberships (
      user_id, team_id, role, status, assigned_by, status_changed_by
    ) VALUES (
      p_target_user_id, p_team_id, p_role, 'ACTIVE', p_actor_id, p_actor_id
    )
    RETURNING id INTO new_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT * INTO live
      FROM public.team_memberships
      WHERE user_id = p_target_user_id
        AND team_id = p_team_id
        AND status IN ('ACTIVE', 'SUSPENDED');
      IF FOUND AND live.status = 'ACTIVE' AND live.role = p_role THEN
        RETURN jsonb_build_object(
          'ok', true,
          'membership_id', live.id,
          'audit_id', NULL,
          'idempotent', true
        );
      END IF;
      RAISE EXCEPTION 'live_membership_exists' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.team_audit_log (
    actor_id, target_user_id, team_id, action, previous_state, new_state, reason, request_id
  ) VALUES (
    p_actor_id,
    p_target_user_id,
    p_team_id,
    'TEAM_MEMBER_ADDED',
    NULL,
    jsonb_build_object('team_id', p_team_id, 'role', p_role, 'status', 'ACTIVE'),
    clean_reason,
    p_request_id
  )
  RETURNING id INTO audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', new_id,
    'audit_id', audit_id,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION team_ops.team_change_role(
  p_actor_id uuid,
  p_membership_id uuid,
  p_role text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row public.team_memberships%ROWTYPE;
  audit_id uuid;
  clean_reason text;
BEGIN
  PERFORM team_ops.assert_owner(p_actor_id);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  clean_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF clean_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  IF char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'reason_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO row
  FROM public.team_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF row.user_id = p_actor_id THEN
    RAISE EXCEPTION 'self_assignment' USING ERRCODE = 'P0001';
  END IF;
  IF row.status = 'REMOVED' THEN
    RAISE EXCEPTION 'removed_membership' USING ERRCODE = 'P0001';
  END IF;
  IF NOT team_ops.role_allowed(row.team_id, p_role) THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = 'P0001';
  END IF;
  IF row.role = p_role THEN
    RETURN jsonb_build_object(
      'ok', true,
      'membership_id', row.id,
      'audit_id', NULL,
      'idempotent', true
    );
  END IF;

  UPDATE public.team_memberships
  SET role = p_role, updated_at = now()
  WHERE id = row.id;

  INSERT INTO public.team_audit_log (
    actor_id, target_user_id, team_id, action, previous_state, new_state, reason, request_id
  ) VALUES (
    p_actor_id,
    row.user_id,
    row.team_id,
    'TEAM_ROLE_CHANGED',
    jsonb_build_object('role', row.role),
    jsonb_build_object('role', p_role),
    clean_reason,
    p_request_id
  )
  RETURNING id INTO audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', row.id,
    'audit_id', audit_id,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION team_ops.team_set_status(
  p_actor_id uuid,
  p_membership_id uuid,
  p_status text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row public.team_memberships%ROWTYPE;
  audit_id uuid;
  clean_reason text;
  audit_action text;
BEGIN
  PERFORM team_ops.assert_owner(p_actor_id);
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_actor' USING ERRCODE = 'P0001';
  END IF;
  IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'REMOVED') THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = 'P0001';
  END IF;
  clean_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF p_status IN ('SUSPENDED', 'REMOVED') AND clean_reason IS NULL THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;
  IF clean_reason IS NOT NULL AND char_length(clean_reason) > 500 THEN
    RAISE EXCEPTION 'reason_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO row
  FROM public.team_memberships
  WHERE id = p_membership_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF row.user_id = p_actor_id THEN
    RAISE EXCEPTION 'self_assignment' USING ERRCODE = 'P0001';
  END IF;
  IF row.status = p_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'membership_id', row.id,
      'audit_id', NULL,
      'idempotent', true
    );
  END IF;
  IF row.status = 'REMOVED' OR NOT (
    (row.status = 'ACTIVE' AND p_status IN ('SUSPENDED', 'REMOVED'))
    OR (row.status = 'SUSPENDED' AND p_status IN ('ACTIVE', 'REMOVED'))
  ) THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE = 'P0001';
  END IF;

  audit_action := CASE p_status
    WHEN 'SUSPENDED' THEN 'TEAM_MEMBERSHIP_SUSPENDED'
    WHEN 'ACTIVE' THEN 'TEAM_MEMBERSHIP_REACTIVATED'
    ELSE 'TEAM_MEMBER_REMOVED'
  END;

  UPDATE public.team_memberships
  SET
    status = p_status,
    updated_at = now(),
    status_changed_at = now(),
    status_changed_by = p_actor_id,
    removed_at = CASE WHEN p_status = 'REMOVED' THEN now() ELSE NULL END
  WHERE id = row.id;

  INSERT INTO public.team_audit_log (
    actor_id, target_user_id, team_id, action, previous_state, new_state, reason, request_id
  ) VALUES (
    p_actor_id,
    row.user_id,
    row.team_id,
    audit_action,
    jsonb_build_object('status', row.status),
    jsonb_build_object('status', p_status),
    clean_reason,
    p_request_id
  )
  RETURNING id INTO audit_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', row.id,
    'audit_id', audit_id,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION team_ops.team_search_users(p_actor_id uuid, p_query text)
RETURNS TABLE (id uuid, display_name text, username text, email text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  clean text;
BEGIN
  PERFORM team_ops.assert_owner(p_actor_id);
  clean := btrim(COALESCE(p_query, ''));
  IF char_length(clean) < 2 THEN
    RETURN;
  END IF;
  IF char_length(clean) > 80 THEN
    RAISE EXCEPTION 'reason_invalid' USING ERRCODE = 'P0001';
  END IF;
  clean := replace(replace(replace(clean, '\', '\\'), '%', '\%'), '_', '\_');

  RETURN QUERY
  SELECT p.id, p.display_name, p.username, u.email::text
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.display_name ILIKE '%' || clean || '%' ESCAPE '\'
     OR p.username ILIKE '%' || clean || '%' ESCAPE '\'
     OR u.email ILIKE '%' || clean || '%' ESCAPE '\'
     OR p.id::text = btrim(p_query)
  ORDER BY p.display_name NULLS LAST
  LIMIT 20;
END;
$$;

REVOKE ALL ON FUNCTION team_ops.role_allowed(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.assert_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_assign_member(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_change_role(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_set_status(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_search_users(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.reject_membership_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.reject_audit_mutation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION team_ops.role_allowed(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.assert_owner(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_assign_member(uuid, uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_change_role(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_set_status(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_search_users(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.team_assign_member(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_team_id text,
  p_role text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.team_assign_member(
    p_actor_id, p_target_user_id, p_team_id, p_role, p_reason, p_request_id
  );
$$;

CREATE OR REPLACE FUNCTION public.team_change_role(
  p_actor_id uuid,
  p_membership_id uuid,
  p_role text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.team_change_role(p_actor_id, p_membership_id, p_role, p_reason, p_request_id);
$$;

CREATE OR REPLACE FUNCTION public.team_set_status(
  p_actor_id uuid,
  p_membership_id uuid,
  p_status text,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT team_ops.team_set_status(p_actor_id, p_membership_id, p_status, p_reason, p_request_id);
$$;

CREATE OR REPLACE FUNCTION public.team_search_users(p_actor_id uuid, p_query text)
RETURNS TABLE (id uuid, display_name text, username text, email text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT * FROM team_ops.team_search_users(p_actor_id, p_query);
$$;

REVOKE ALL ON FUNCTION public.team_assign_member(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_change_role(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_set_status(uuid, uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_search_users(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.team_assign_member(uuid, uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_change_role(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_set_status(uuid, uuid, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_search_users(uuid, text) TO service_role;

COMMIT;
