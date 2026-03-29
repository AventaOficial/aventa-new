-- Marca la primera vez que el usuario guarda su nombre desde Configuración.
-- Sin esto, display_name_updated_at con DEFAULT now() en inserts bloqueaba el primer cambio 14 días.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_saved_in_settings_at timestamptz;

COMMENT ON COLUMN public.profiles.name_saved_in_settings_at IS
  'Primera vez que el usuario guardó el nombre visible desde /settings; antes de esto el cambio de nombre es libre.';
