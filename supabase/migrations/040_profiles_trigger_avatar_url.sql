-- Trigger handle_new_user: añadir avatar_url desde Google (picture / avatar_url en raw_user_meta_data).
-- Opcional: la API sync-profile ya rellena avatar_url al cargar sesión; esto evita un round-trip para usuarios nuevos.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NULLIF(TRIM(
      COALESCE(
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.raw_user_meta_data->>'picture',
        ''
      )
    ), '')
  );
  RETURN NEW;
END;
$$;
