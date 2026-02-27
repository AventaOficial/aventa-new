-- Tabla de eventos de impacto (views, outbound clicks)
CREATE TABLE IF NOT EXISTS public.offer_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'outbound')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_events_offer_id ON public.offer_events(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_events_created_at ON public.offer_events(created_at);
