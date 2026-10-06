-- Identidad opcional de perfil. No incluye nacionalidad ni datos fiscales.
-- show_location queda apagado: ciudad y estado no salen al perfil público hasta que la persona lo active.
-- show_activity queda encendido para no ocultar ofertas que ya eran públicas.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS cover_url text,
  ADD COLUMN IF NOT EXISTS show_location boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_activity boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'public';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_visibility_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_visibility_check
  CHECK (profile_visibility IN ('public', 'private'));

COMMENT ON COLUMN public.profiles.bio IS 'Texto público opcional. Vacío no se muestra.';
COMMENT ON COLUMN public.profiles.city IS 'Ciudad opcional. Solo pública si show_location es true.';
COMMENT ON COLUMN public.profiles.state IS 'Estado opcional. Solo público si show_location es true.';
COMMENT ON COLUMN public.profiles.cover_url IS 'Portada opcional. No se muestra si el perfil es privado.';
COMMENT ON COLUMN public.profiles.show_location IS 'La ubicación no es pública por defecto.';
COMMENT ON COLUMN public.profiles.show_activity IS 'Ofertas y actividad del perfil público.';
COMMENT ON COLUMN public.profiles.profile_visibility IS 'public o private. private oculta bio, portada, ubicación y actividad.';
