-- Historial propio de precios por oferta (snapshots).
-- Se usa para mostrar en "Información adicional" si el precio actual
-- parece bueno vs lo visto en AVENTA (hasta 90 días), sin UI ruidosa.

CREATE TABLE IF NOT EXISTS public.offer_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  original_price numeric(12, 2) NULL,
  source text NOT NULL DEFAULT 'app'
    CHECK (source = ANY (ARRAY['create'::text, 'update'::text, 'health'::text, 'manual'::text, 'app'::text])),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_price_snapshots_offer_recorded
  ON public.offer_price_snapshots (offer_id, recorded_at DESC);

ALTER TABLE public.offer_price_snapshots ENABLE ROW LEVEL SECURITY;

-- Sin policies para anon/authenticated: solo service_role (APIs del servidor).
REVOKE ALL ON TABLE public.offer_price_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.offer_price_snapshots TO service_role;
