-- Alinea el trigger de límite de nombre con /settings (app).
-- Problema: el trigger solo miraba 14 días desde display_name_updated_at (p. ej. alta),
-- y rechazaba aunque name_saved_in_settings_at fuera NULL (primer guardado desde Configuración).
-- Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.enforce_display_name_change_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.display_name IS DISTINCT FROM NEW.display_name THEN
    -- Misma regla que el cliente: libre mientras no haya guardado nombre desde Configuración.
    IF OLD.name_saved_in_settings_at IS NULL THEN
      RETURN NEW;
    END IF;
    -- Ya guardó al menos una vez desde Configuración: 14 días desde la última actualización del nombre.
    IF OLD.display_name_updated_at IS NOT NULL
       AND (clock_timestamp() - OLD.display_name_updated_at) < interval '14 days' THEN
      RAISE EXCEPTION 'Display name can only be changed once every 14 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Si el trigger ya existía, solo la función basta; si no existe, créalo:
DROP TRIGGER IF EXISTS enforce_display_name_change_limit_trigger ON public.profiles;

CREATE TRIGGER enforce_display_name_change_limit_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_display_name_change_limit();

COMMENT ON FUNCTION public.enforce_display_name_change_limit() IS
  'Límite 14 días en cambio de display_name solo si name_saved_in_settings_at ya estaba fijado; si es NULL, cambio libre (alineado con /settings).';
