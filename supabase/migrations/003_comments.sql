-- Tabla de comentarios por oferta (solo lectura pública, insert solo autenticado)
-- user_id referencia profiles para permitir join con display_name del autor
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content VARCHAR(280) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_offer_id ON public.comments(offer_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede leer comentarios
CREATE POLICY "Cualquiera puede leer comentarios"
  ON public.comments FOR SELECT USING (true);

-- Solo usuarios autenticados pueden insertar su propio comentario
CREATE POLICY "Autenticados pueden insertar su comentario"
  ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
