-- Token OAuth de plataforma Mercado Libre (una fila por provider).
-- Solo service_role; sin policies RLS para anon/authenticated.

CREATE TABLE IF NOT EXISTS public.mercadolibre_oauth_tokens (
  provider text PRIMARY KEY DEFAULT 'mercadolibre'
    CHECK (provider = 'mercadolibre'),
  ml_user_id bigint NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_type text NOT NULL DEFAULT 'bearer',
  scope text NULL,
  expires_at timestamptz NOT NULL,
  connected_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  last_refresh_at timestamptz NULL,
  last_refresh_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mercadolibre_oauth_tokens IS
  'Conexión OAuth Mercado Libre de plataforma Aventa. Una fila; acceso exclusivo service_role.';

ALTER TABLE public.mercadolibre_oauth_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mercadolibre_oauth_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mercadolibre_oauth_tokens TO service_role;
