-- DEPRECATED on 2026-10-18. Do not run this historical staff-role sync again.
-- This seed previously copied staff labels from profiles.role into user_roles.
-- The Team OS cutover now uses ACTIVE team_memberships for collaborators and reserves
-- user_roles exclusively for the global owner. See:
--   STAGING_20261018_profile_role_legacy_cutover.sql
--   20261018_team_os_rls_policy_cutover.sql
--
-- Intentionally a no-op so a manual re-run cannot resurrect legacy admin/moderator grants.
DO $deprecated$
BEGIN
  RAISE NOTICE 'Deprecated: profiles.role -> user_roles sync is disabled; use Team OS memberships.';
END
$deprecated$;
