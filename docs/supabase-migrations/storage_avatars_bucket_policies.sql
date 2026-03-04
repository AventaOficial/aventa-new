-- Bucket "avatars" y políticas para foto de perfil (Configuración → General).
-- Ejecutar en Supabase SQL Editor después de crear el bucket.
--
-- 1) Crear el bucket en Dashboard (Storage → New bucket):
--    - Name: avatars
--    - Public bucket: sí (para que getPublicUrl() sirva sin signed URLs)
--
-- 2) Políticas RLS en storage.objects:
--    - Solo usuarios autenticados pueden subir/actualizar un objeto cuyo nombre
--      empiece por su user id (ej. {auth.uid()}.jpg). La API usa nombre = userId + extensión.
--    - Lectura pública para que las fotos se vean en la app.

-- Política INSERT: solo si el nombre del objeto es "{tu-user-id}.ext"
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = (auth.uid())::text
);

-- Política UPDATE: solo sobre tus propios objetos (mismo criterio)
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = (auth.uid())::text
)
WITH CHECK (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = (auth.uid())::text
);

-- Política SELECT: lectura pública para que las URLs de avatar funcionen
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'avatars');

-- Política DELETE: solo borrar tu propio archivo (opcional, por si se añade “quitar foto”)
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND split_part(name, '.', 1) = (auth.uid())::text
);
