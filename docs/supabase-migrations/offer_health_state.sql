-- Estado actual de salud por oferta (MVP: sin histórico de checks).
-- Solo service_role vía API/cron; sin políticas RLS de lectura pública.

CREATE TABLE IF NOT EXISTS public.offer_health_state (
  offer_id uuid PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('available', 'price_changed', 'out_of_stock')),
  last_checked_at timestamptz NOT NULL,
  published_price numeric,
  live_price numeric,
  price_delta_pct numeric,
  diagnostic text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_health_state_status
  ON public.offer_health_state (status);

CREATE INDEX IF NOT EXISTS idx_offer_health_state_last_checked
  ON public.offer_health_state (last_checked_at DESC);

ALTER TABLE public.offer_health_state ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.offer_health_state IS
  'Último resultado de verificación en tienda (precio/agotado). Actualizado por cron offer-health-scan.';
