-- Simulate what Auth does: call handle_new_user semantics as a non-bypass role.
-- Check which roles bypass RLS.
SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN (
  'postgres',
  'supabase_auth_admin',
  'authenticator',
  'authenticated',
  'anon',
  'service_role',
  'supabase_admin'
)
ORDER BY rolname;
