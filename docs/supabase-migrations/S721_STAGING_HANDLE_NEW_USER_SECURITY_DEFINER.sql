-- =============================================================================
-- S7.2.1 — STAGING ONLY repair: public.handle_new_user SECURITY DEFINER
-- Target: oojshofrpbfwsiypcecr (Aventa Staging)
-- DO NOT run against production (mkgsrpsuvedwwlzmzmzh).
-- =============================================================================
--
-- CAUSE:
--   auth.admin.createUser fails with "Database error creating new user" because
--   trigger on_auth_user_created → public.handle_new_user() inserts into
--   public.profiles while:
--     - profiles.RLS = ON
--     - no INSERT policy on profiles
--     - supabase_auth_admin.rolbypassrls = false
--     - staging handle_new_user was NOT SECURITY DEFINER
--
-- OBJECT:
--   public.handle_new_user()  (trigger function for auth.users)
--
-- IMPACT:
--   Restores Auth → profiles provisioning for new users (machine + human).
--   Does not change RLS policies, roles, or existing profiles.
--
-- WHY ARCHITECTURALLY CORRECT:
--   Production already uses SECURITY DEFINER handle_new_user (canonical).
--   Repo docs (security_audit) state: INSERT via handle_new_user (definer).
--   Aligns staging with production semantics; no new tables; no seed-admin reuse.
--
-- VERIFY:
--   1) auth.admin.createUser succeeds
--   2) matching profiles row with role default 'user'
--   3) npx tsx scripts/s72-provision-machine-author.ts
--
-- REVERT:
--   Restore previous body (insert id, created_at only; no SECURITY DEFINER)
--   from scripts/_s721_reports/02_handle_new_user_fn.json
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
      'Usuario'
    ),
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), '')
    ),
    NULLIF(
      TRIM(
        COALESCE(
          NEW.raw_user_meta_data->>'avatar_url',
          NEW.raw_user_meta_data->>'picture',
          ''
        )
      ),
      ''
    ),
    'user'
  );
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile may already exist (e.g. sync-profile race); do not fail signup.
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE;
END;
$function$;

-- Harden grants: only privileged callers need this (trigger executes as owner).
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
