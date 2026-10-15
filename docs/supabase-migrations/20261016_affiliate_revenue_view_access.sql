-- Internal affiliate rollups: not for anon/authenticated Data API clients.
DO $migration$
BEGIN
  IF to_regclass('public.v_affiliate_revenue_by_user') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE public.v_affiliate_revenue_by_user FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON TABLE public.v_affiliate_revenue_by_user TO service_role';
  END IF;
END
$migration$;
