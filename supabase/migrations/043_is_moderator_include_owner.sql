-- Due diligence: alinear RLS de offers con modelo de roles (owner > admin > moderator).
-- is_moderator() debe incluir 'owner' para que las políticas offers_update_owner_or_moderator
-- y offers_delete_owner_or_moderator permitan al owner modificar/borrar cualquier oferta.

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = ANY (ARRAY['owner', 'admin', 'moderator'])
  );
$$;

COMMENT ON FUNCTION public.is_moderator() IS 'True si el usuario tiene rol owner, admin o moderator (para RLS en offers).';
