-- CazaOfertasss FASE 4.1 — Affiliate mappings operados
-- STAGING-FIRST. Do NOT apply to production without explicit approval.
-- Money-path Aventa untouched: NO toca creator_rewards / payout_intents /
-- reward_payouts / commissions / settlement.
--
-- Tabla:
--   caza_affiliate_mappings — asociación operada identidad-producto → URL afiliada.
--
-- Identidad:
--   identity_key == DealIdentity.key ('store:pid:<id>' primaria | 'store:url:<hash>' fallback).
--   UNIQUE (identity_key). Nunca title / price / discount.
--
-- Secretos: NUNCA se almacenan (ni bot tokens, ni service_role, ni credenciales).
--   El credential ref se deriva de la red en el dominio; no hay columna para ello.
--
-- Access model (RLS): server-only (service_role). REVOKE anon/authenticated.

CREATE TABLE IF NOT EXISTS public.caza_affiliate_mappings (
  id text PRIMARY KEY,
  identity_key text NOT NULL,
  identity_strategy text NOT NULL
    CHECK (identity_strategy IN ('external_product_id', 'canonical_url')),
  store text NOT NULL
    CHECK (store IN ('mercadolibre_mx', 'amazon_mx')),
  external_product_id text NULL
    CHECK (external_product_id IS NULL OR length(external_product_id) BETWEEN 1 AND 128),
  canonical_url text NOT NULL
    CHECK (canonical_url ~* '^https://'),
  affiliate_url text NOT NULL
    CHECK (affiliate_url ~* '^https://'),
  network text NOT NULL
    CHECK (network IN ('mercadolibre_affiliates', 'amazon_associates_mx')),
  tracking_label text NULL
    CHECK (tracking_label IS NULL OR tracking_label ~ '^[a-z0-9_]{6,64}$'),
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED', 'EXPIRED')),
  valid_from timestamptz NOT NULL,
  valid_until timestamptz NULL
    CHECK (valid_until IS NULL OR valid_until > valid_from),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- identidad primaria store+pid o fallback URL codificada en identity_key
  CONSTRAINT caza_affiliate_mappings_identity_key_uidx UNIQUE (identity_key),
  -- coherencia estrategia ↔ pid
  CONSTRAINT caza_affiliate_mappings_strategy_pid_chk CHECK (
    (identity_strategy = 'external_product_id' AND external_product_id IS NOT NULL)
    OR (identity_strategy = 'canonical_url' AND external_product_id IS NULL)
  ),
  -- red coherente con tienda (misma tabla STORE_TO_NETWORK del dominio)
  CONSTRAINT caza_affiliate_mappings_store_network_chk CHECK (
    (store = 'amazon_mx' AND network = 'amazon_associates_mx')
    OR (store = 'mercadolibre_mx' AND network = 'mercadolibre_affiliates')
  ),
  -- defensa: nada que parezca secreto
  CONSTRAINT caza_affiliate_mappings_no_secret_chk CHECK (
    affiliate_url !~* 'service_role'
    AND affiliate_url !~ '[0-9]{6,12}:[A-Za-z0-9_-]{20,}'
    AND affiliate_url !~ 'eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}'
  )
);

COMMENT ON TABLE public.caza_affiliate_mappings IS
  'CazaOfertasss FASE 4.1 — operated affiliate mappings. identity_key == DealIdentity.key. No secrets. Independent of Aventa money path.';
COMMENT ON COLUMN public.caza_affiliate_mappings.identity_key IS
  'store:pid:<externalProductId> (primary) or store:url:<hash> (fallback). UNIQUE.';
COMMENT ON COLUMN public.caza_affiliate_mappings.tracking_label IS
  'Operator-declared tracking label validated by domain rules. NULL means no tracking declared (never faked).';

-- Unicidad explícita de la identidad primaria (redundante con identity_key; documenta la intención).
CREATE UNIQUE INDEX IF NOT EXISTS caza_affiliate_mappings_store_pid_uidx
  ON public.caza_affiliate_mappings (store, external_product_id)
  WHERE external_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS caza_affiliate_mappings_store_status_idx
  ON public.caza_affiliate_mappings (store, status, valid_until);

-- updated_at siempre server-side
CREATE OR REPLACE FUNCTION public.caza_affiliate_mappings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  -- created_at es inmutable
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS caza_affiliate_mappings_touch_updated_at_trg ON public.caza_affiliate_mappings;
CREATE TRIGGER caza_affiliate_mappings_touch_updated_at_trg
  BEFORE INSERT OR UPDATE ON public.caza_affiliate_mappings
  FOR EACH ROW EXECUTE FUNCTION public.caza_affiliate_mappings_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: server-only. Sin políticas anon/authenticated. Sin escritura desde frontend.
-- ---------------------------------------------------------------------------
ALTER TABLE public.caza_affiliate_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.caza_affiliate_mappings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.caza_affiliate_mappings TO service_role;
