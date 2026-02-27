-- Tabla de favoritos por usuario y oferta
CREATE TABLE IF NOT EXISTS public.offer_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, offer_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_favorites_user_id ON public.offer_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_offer_favorites_offer_id ON public.offer_favorites(offer_id);

ALTER TABLE public.offer_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden ver sus favoritos"
  ON public.offer_favorites FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden insertar sus favoritos"
  ON public.offer_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios pueden eliminar sus favoritos"
  ON public.offer_favorites FOR DELETE USING (auth.uid() = user_id);
