-- Centro de control operativo. No toca dinero, RLS ni secretos.
-- No aplicar en producción sin revisión. El código funciona con los valores
-- en repositorio si esta tabla todavía no existe.

CREATE TABLE IF NOT EXISTS public.operational_controls (
  domain text NOT NULL CHECK (domain IN ('feed_presentation', 'store_profile', 'ad_campaign', 'discovery_agent')),
  record_key text NOT NULL CHECK (record_key ~ '^[a-z0-9][a-z0-9_-]{1,64}$'),
  payload jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain, record_key)
);

CREATE TABLE IF NOT EXISTS public.operational_control_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  domain text NOT NULL,
  record_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('upsert')),
  before_payload jsonb,
  after_payload jsonb,
  result text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operational_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_control_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operational_controls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.operational_control_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.operational_controls TO service_role;
GRANT ALL ON TABLE public.operational_control_audit TO service_role;

-- Sin políticas para authenticated: el cliente no lee ni escribe.
-- El panel usa el service role después de comprobar el rol owner.
