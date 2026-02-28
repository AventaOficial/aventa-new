-- Mostrar nombre de usuario desde Google OAuth (full_name / name en raw_user_meta_data)
-- Google no envía display_name; envía full_name o name.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      split_part(COALESCE(NEW.email, ''), '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

-- Perfiles existentes: actualizar display_name desde Google se hace en el cliente
-- (Navbar sincroniza con user_metadata.full_name / name al cargar si está vacío).
