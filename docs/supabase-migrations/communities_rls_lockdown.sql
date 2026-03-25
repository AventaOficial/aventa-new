-- Comunidades desactivadas en producto: cerrar acceso directo vía PostgREST (anon/authenticated).
-- El rol service_role sigue pudiendo leer/escribir (bypass RLS) para APIs servidor y futuro re-lanzamiento.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE IF EXISTS public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.community_offers ENABLE ROW LEVEL SECURITY;

-- Sin políticas explícitas: por defecto nadie con rol que respete RLS ve filas desde el cliente.
-- (service_role en el backend de Next.js no usa RLS de la misma forma: bypass.)
