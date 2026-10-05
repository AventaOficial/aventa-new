-- MCP Grok Bots — clientes máquina, auditoría de llamadas y origen máquina en lotes.
--
-- Contrato: docs/SYSTEMS/MCP_GROK_BOTS.md
--
-- Un cliente máquina (p. ej. un bot de Grok) sólo propone candidatos. El camino es:
--   MCP -> offer_batches / offer_batch_items -> pipeline de lotes existente -> moderación humana
--   -> ingestOfferObservation (único writer de ofertas).
-- Esta migración NO crea tablas de ofertas paralelas ni writers nuevos.
--
-- Escrituras: sólo service_role desde el servidor Next. anon/authenticated sin acceso.
-- Aplicación manual: staging primero, luego production. Idempotente. No destructiva.

-- ---------------------------------------------------------------------------
-- 1. machine_clients
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.machine_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  token_prefix text NOT NULL CHECK (token_prefix ~ '^[0-9a-f]{12}$'),
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] NOT NULL
    CHECK (
      cardinality(scopes) BETWEEN 1 AND 3
      AND scopes <@ ARRAY['candidates:submit', 'candidates:read', 'catalog:read']::text[]
    ),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'revoked')),
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  daily_candidate_cap integer NOT NULL DEFAULT 200
    CHECK (daily_candidate_cap BETWEEN 1 AND 1000),
  expires_at timestamptz NULL,
  created_by uuid NOT NULL,
  revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT machine_clients_revoked_consistency
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS machine_clients_token_prefix_uidx
  ON public.machine_clients (token_prefix);
CREATE INDEX IF NOT EXISTS idx_machine_clients_author
  ON public.machine_clients (author_profile_id);
CREATE INDEX IF NOT EXISTS idx_machine_clients_status
  ON public.machine_clients (status, created_at DESC);

COMMENT ON TABLE public.machine_clients IS
  'Clientes máquina MCP (proveedores de candidatos). Token: sólo prefijo + SHA-256. Sin DELETE; revocar es permanente.';
COMMENT ON COLUMN public.machine_clients.author_profile_id IS
  'Perfil bot que figura como autor (offers.created_by) cuando un humano aprueba un candidato. Económicamente inerte.';
COMMENT ON COLUMN public.machine_clients.token_hash IS
  'SHA-256 hex del token completo. El token en claro se muestra una sola vez al crearlo y nunca se guarda.';

-- Revocar es permanente y la fila nunca se borra (el firewall económico la usa para siempre).
CREATE OR REPLACE FUNCTION public.machine_clients_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'machine_clients rows cannot be deleted; revoke instead'
      USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'revoked' THEN
    RAISE EXCEPTION 'machine_clients: revoked clients are immutable'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.author_profile_id IS DISTINCT FROM OLD.author_profile_id
     OR NEW.token_prefix IS DISTINCT FROM OLD.token_prefix
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'machine_clients: identity columns are immutable; create a new client to rotate'
      USING ERRCODE = '42501';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS machine_clients_guard_update ON public.machine_clients;
CREATE TRIGGER machine_clients_guard_update
  BEFORE UPDATE ON public.machine_clients
  FOR EACH ROW EXECUTE FUNCTION public.machine_clients_guard();

DROP TRIGGER IF EXISTS machine_clients_guard_delete ON public.machine_clients;
CREATE TRIGGER machine_clients_guard_delete
  BEFORE DELETE ON public.machine_clients
  FOR EACH ROW EXECUTE FUNCTION public.machine_clients_guard();

DROP TRIGGER IF EXISTS machine_clients_guard_truncate ON public.machine_clients;
CREATE TRIGGER machine_clients_guard_truncate
  BEFORE TRUNCATE ON public.machine_clients
  FOR EACH STATEMENT EXECUTE FUNCTION public.machine_clients_guard();

-- ---------------------------------------------------------------------------
-- 2. machine_client_calls (auditoría append-only)
-- ---------------------------------------------------------------------------
-- Nunca guarda token, cabecera Authorization, payload crudo ni contenido de terceros.

CREATE TABLE IF NOT EXISTS public.machine_client_calls (
  id bigserial PRIMARY KEY,
  machine_client_id uuid NOT NULL REFERENCES public.machine_clients(id) ON DELETE RESTRICT,
  tool text NOT NULL CHECK (tool IN (
    'submit_deal_candidates', 'get_submission_status', 'check_offer_exists', 'get_submission_rules'
  )),
  request_id text NOT NULL CHECK (char_length(request_id) BETWEEN 8 AND 64),
  result_status text NOT NULL CHECK (char_length(result_status) BETWEEN 1 AND 40),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  duplicate_count integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_machine_client_calls_client_created
  ON public.machine_client_calls (machine_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_machine_client_calls_created
  ON public.machine_client_calls (created_at DESC);

COMMENT ON TABLE public.machine_client_calls IS
  'Auditoría append-only de llamadas MCP. Sin secretos ni payload. Nunca se actualiza ni borra.';

CREATE OR REPLACE FUNCTION public.machine_client_calls_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'machine_client_calls is append-only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS machine_client_calls_no_update ON public.machine_client_calls;
CREATE TRIGGER machine_client_calls_no_update
  BEFORE UPDATE OR DELETE ON public.machine_client_calls
  FOR EACH ROW EXECUTE FUNCTION public.machine_client_calls_append_only();

-- TRUNCATE no dispara triggers por fila.
DROP TRIGGER IF EXISTS machine_client_calls_no_truncate ON public.machine_client_calls;
CREATE TRIGGER machine_client_calls_no_truncate
  BEFORE TRUNCATE ON public.machine_client_calls
  FOR EACH STATEMENT EXECUTE FUNCTION public.machine_client_calls_append_only();

-- ---------------------------------------------------------------------------
-- 3. Origen máquina en offer_batches (idempotencia por cliente)
-- ---------------------------------------------------------------------------

ALTER TABLE public.offer_batches
  ADD COLUMN IF NOT EXISTS machine_client_id uuid NULL REFERENCES public.machine_clients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mcp_idempotency_key text NULL,
  ADD COLUMN IF NOT EXISTS mcp_payload_hash text NULL,
  ADD COLUMN IF NOT EXISTS mcp_run_id text NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offer_batches_mcp_origin_consistency'
  ) THEN
    ALTER TABLE public.offer_batches
      ADD CONSTRAINT offer_batches_mcp_origin_consistency CHECK (
        (machine_client_id IS NULL AND mcp_idempotency_key IS NULL AND mcp_payload_hash IS NULL AND mcp_run_id IS NULL)
        OR (
          machine_client_id IS NOT NULL
          AND mcp_idempotency_key IS NOT NULL
          AND char_length(mcp_idempotency_key) BETWEEN 8 AND 128
          AND mcp_payload_hash ~ '^[0-9a-f]{64}$'
          AND (mcp_run_id IS NULL OR char_length(mcp_run_id) BETWEEN 1 AND 128)
        )
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS offer_batches_mcp_idempotency_uidx
  ON public.offer_batches (machine_client_id, mcp_idempotency_key)
  WHERE machine_client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_offer_batches_machine_client_created
  ON public.offer_batches (machine_client_id, created_at DESC)
  WHERE machine_client_id IS NOT NULL;

COMMENT ON COLUMN public.offer_batches.machine_client_id IS
  'Cliente MCP que propuso el lote. Al aprobar, offers.created_by = machine_clients.author_profile_id (nunca el moderador).';

-- ---------------------------------------------------------------------------
-- 4. RLS y grants: service_role únicamente
-- ---------------------------------------------------------------------------

ALTER TABLE public.machine_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_client_calls ENABLE ROW LEVEL SECURITY;

-- Los privilegios por defecto de Supabase conceden ALL (incl. DELETE y TRUNCATE) también a service_role.
REVOKE ALL ON TABLE public.machine_clients FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.machine_client_calls FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SEQUENCE public.machine_client_calls_id_seq FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.machine_clients TO service_role;
GRANT SELECT, INSERT ON TABLE public.machine_client_calls TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.machine_client_calls_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.machine_clients_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.machine_client_calls_append_only() FROM PUBLIC, anon, authenticated;

-- Sin policies para anon/authenticated: fail-closed. service_role ignora RLS.
