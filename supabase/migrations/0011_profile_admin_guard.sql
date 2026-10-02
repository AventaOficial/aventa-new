-- 0011 — El guardia del último administrador no debe tumbar
-- un cambio normal de perfil.
-- La función corría como el usuario autenticado. Esa sesión solo puede
-- leer su propia fila de profiles, así que el conteo de admins salía 0
-- y cualquier UPDATE propio fallaba.

CREATE OR REPLACE FUNCTION public.ensure_at_least_one_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admins integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_admins
  FROM public.profiles
  WHERE role = 'admin';

  IF v_admins = 0 THEN
    RAISE EXCEPTION 'Operación rechazada: no puede quedar el sistema sin administradores.';
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_at_least_one_admin() FROM PUBLIC, anon, authenticated;
