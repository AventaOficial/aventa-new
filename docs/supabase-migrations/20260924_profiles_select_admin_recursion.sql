-- Staging profiles_select_admin subqueries public.profiles under RLS.
-- PostgreSQL raises 42P17 (infinite recursion) and PostgREST returns HTTP 500
-- on every authenticated SELECT, including onboarding_completed.
-- Other permissive SELECT policies already allow the read, so dropping this
-- policy does not grant new access and does not disable RLS.

DROP POLICY IF EXISTS profiles_select_admin ON public.profiles;
