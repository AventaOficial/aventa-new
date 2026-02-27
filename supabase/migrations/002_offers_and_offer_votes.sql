-- Tablas base: offers y offer_votes (requeridas por 003, 005, 007, etc.)
-- created_by en offers: FK a profiles se añade en 004.

CREATE TABLE IF NOT EXISTS public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  price NUMERIC NOT NULL,
  original_price NUMERIC,
  image_url TEXT,
  store TEXT,
  offer_url TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'published')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  rejection_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offers_created_by ON public.offers(created_by);
CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers(status);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON public.offers(created_at);

CREATE TABLE IF NOT EXISTS public.offer_votes (
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_votes_offer_id ON public.offer_votes(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_votes_user_id ON public.offer_votes(user_id);
