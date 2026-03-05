-- Preferencias de categorías del usuario (onboarding: 3; configuración: ilimitadas).
-- Valores: despensa, comida, hogar, mascotas, bebidas, electrones, ropa_mujer, ropa_hombre, deportes, libros, bancaria, other.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_categories text[] DEFAULT '{}';

COMMENT ON COLUMN public.profiles.preferred_categories IS 'Categorías que le interesan al usuario (onboarding: hasta 3; en configuración puede añadir más).';
