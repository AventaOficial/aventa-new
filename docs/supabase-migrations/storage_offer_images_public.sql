-- Hacer el bucket offer-images público para que las fotos de las ofertas se vean.
-- Sin esto, la subida funciona pero la URL pública devuelve 403 y la imagen no carga en el feed.
--
-- OPCIÓN RECOMENDADA: Dashboard de Supabase
--   1. Storage → Buckets
--   2. Si "offer-images" no existe: New bucket → Name: offer-images → marcar "Public bucket" → Create
--   3. Si ya existe: offer-images → Configuration (engranaje) → activar "Public bucket"
--
-- OPCIÓN ALTERNATIVA: Política RLS en storage.objects (permite lectura pública del bucket)
-- Ejecutar en SQL Editor. Si ya tienes una política similar, omite o ajusta el nombre.

CREATE POLICY "Allow public read offer-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'offer-images');
