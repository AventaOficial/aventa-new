-- Vista pública de perfiles para mostrar autor de ofertas sin depender de sesión.
-- Expone solo campos públicos (id, display_name, avatar_url).
-- PostgREST usa las FK de la tabla base (profiles) para los joins.
CREATE OR REPLACE VIEW public.public_profiles_view AS
SELECT id, display_name, avatar_url
FROM public.profiles;

-- Política para permitir lectura pública de perfiles (solo SELECT).
-- Permite mostrar autor de ofertas/comentarios a usuarios no autenticados.
-- INSERT/UPDATE/DELETE siguen protegidos por las políticas existentes.
CREATE POLICY "Perfiles públicos visibles para todos" ON public.profiles
  FOR SELECT USING (true);
