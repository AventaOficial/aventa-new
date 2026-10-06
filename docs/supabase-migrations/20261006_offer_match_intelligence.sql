-- Identidad de producto y observaciones de match.
-- No modifica ofertas históricas con un tipo de cambio.
-- No abre estas tablas al navegador.

CREATE TABLE IF NOT EXISTS public.offer_product_identities (
  offer_id uuid PRIMARY KEY REFERENCES public.offers(id) ON DELETE CASCADE,
  identity_key text NOT NULL,
  identity_strength text NOT NULL CHECK (identity_strength IN ('strong', 'listing')),
  variant_token text,
  algorithm_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offer_product_identities_key_idx
  ON public.offer_product_identities (identity_key);

-- La búsqueda de candidatos usa offers.product_fingerprint, ya poblado en la ingesta.
-- El índice parcial amz|ml sigue existiendo; este cubre el resto de huellas no nulas.
CREATE INDEX IF NOT EXISTS offers_product_fingerprint_eq_idx
  ON public.offers (product_fingerprint)
  WHERE product_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.offer_match_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  matched_offer_id uuid REFERENCES public.offers(id) ON DELETE CASCADE,
  relation_type text NOT NULL,
  confidence numeric,
  signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_status text NOT NULL,
  algorithm_version text NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offer_id, matched_offer_id, algorithm_version)
);

ALTER TABLE public.offer_product_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_match_observations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.offer_product_identities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.offer_match_observations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_product_identities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offer_match_observations TO service_role;
