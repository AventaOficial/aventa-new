-- Rellena display_name en profiles desde auth.users (Google, etc.) cuando está vacío.
-- Ejecutar en Supabase SQL Editor (tiene acceso al esquema auth).

UPDATE public.profiles p
SET display_name = sub.name
FROM (
  SELECT
    u.id,
    COALESCE(
      NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(u.raw_user_meta_data->>'name'), '')
    ) AS name
  FROM auth.users u
) sub
WHERE p.id = sub.id
  AND sub.name IS NOT NULL
  AND (p.display_name IS NULL OR TRIM(p.display_name) = '');

-- Opcional: trigger para futuros usuarios (si no tienes ya uno que cree el perfil).
-- Si tu flujo ya crea el perfil con display_name en el cliente, no hace falta.
-- Para que los nuevos signups con Google tengan display_name desde el primer momento,
-- asegúrate de que el código que crea el perfil (p. ej. on signup) use user_metadata.full_name.
