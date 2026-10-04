-- Team OS: Team Management sin lecturas de auth.users.
-- En Supabase service_role no tiene SELECT sobre auth.users y estas funciones son SECURITY INVOKER:
-- team_assign_member y team_search_users fallaban con 42501 "permission denied for table users".
-- public.profiles es 1:1 con auth.users. Las FK de team_memberships siguen exigiendo que el usuario exista.
-- No cambia tablas, RLS, grants de tablas ni estados. Solo estas dos funciones.

BEGIN;

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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
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

DROP FUNCTION IF EXISTS public.team_search_users(uuid, text);
DROP FUNCTION IF EXISTS team_ops.team_search_users(uuid, text);

-- Búsqueda vacía: primera página de perfiles. p_limit acepta una fila extra para saber si hay más.
CREATE OR REPLACE FUNCTION team_ops.team_search_users(
  p_actor_id uuid,
  p_query text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (id uuid, display_name text, username text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  clean text;
  pattern text;
BEGIN
  PERFORM team_ops.assert_owner(p_actor_id);
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 51 THEN
    RAISE EXCEPTION 'query_invalid' USING ERRCODE = 'P0001';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION 'query_invalid' USING ERRCODE = 'P0001';
  END IF;
  clean := btrim(COALESCE(p_query, ''));
  IF char_length(clean) > 80 THEN
    RAISE EXCEPTION 'query_invalid' USING ERRCODE = 'P0001';
  END IF;
  pattern := '%' || replace(replace(replace(clean, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  SELECT p.id, p.display_name::text, p.username::text
  FROM public.profiles p
  WHERE clean = ''
     OR p.display_name ILIKE pattern ESCAPE '\'
     OR p.username ILIKE pattern ESCAPE '\'
     OR p.id::text = lower(clean)
  ORDER BY
    (COALESCE(p.display_name, p.username) IS NULL),
    lower(COALESCE(p.display_name, p.username, '')),
    p.id
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.team_search_users(
  p_actor_id uuid,
  p_query text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (id uuid, display_name text, username text)
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, team_ops, public
AS $$
  SELECT * FROM team_ops.team_search_users(p_actor_id, p_query, p_limit, p_offset);
$$;

REVOKE ALL ON FUNCTION team_ops.team_assign_member(uuid, uuid, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION team_ops.team_search_users(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.team_search_users(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION team_ops.team_assign_member(uuid, uuid, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION team_ops.team_search_users(uuid, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.team_search_users(uuid, text, integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
