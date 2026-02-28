-- 1) Quitar updated_at de profiles si existe (esquema documentado no lo tiene).
--    Evita que cualquier código o trigger asuma esa columna.
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS updated_at;

-- 2) Función handle_new_user: INSERT solo columnas que existen en public.profiles
--    (id, display_name, avatar_url). El resto tienen DEFAULT o son NULL.
--    No usar updated_at ni ninguna columna que no exista.
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
EXCEPTION
  WHEN unique_violation THEN
    -- Por si el perfil se creó por otra vía (ej. sync-profile); no fallar el signup
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE;
END;
$$;

-- 3) Asegurar que el trigger existe en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
