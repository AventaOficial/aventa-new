-- Bucket público para imágenes de ofertas (2MB, jpg/jpeg/png/webp validados en API)
INSERT INTO storage.buckets (id, name, public)
SELECT 'offer-images', 'offer-images', true
WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'offer-images');
