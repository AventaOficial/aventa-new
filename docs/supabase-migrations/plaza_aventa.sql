-- Plaza Aventa: solicitudes de ofertas y conversaciones.
-- Ejecutar en el SQL Editor de Supabase.

CREATE TABLE IF NOT EXISTS public.plaza_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  details text,
  budget_max numeric,
  preferred_store text,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plaza_discussions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plaza_requests_created_at_idx ON public.plaza_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS plaza_discussions_created_at_idx ON public.plaza_discussions (created_at DESC);

ALTER TABLE public.plaza_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaza_discussions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaza_requests_select_approved ON public.plaza_requests;
CREATE POLICY plaza_requests_select_approved ON public.plaza_requests
  FOR SELECT USING (status = 'approved' OR auth.uid() = user_id);

DROP POLICY IF EXISTS plaza_discussions_select_approved ON public.plaza_discussions;
CREATE POLICY plaza_discussions_select_approved ON public.plaza_discussions
  FOR SELECT USING (status = 'approved' OR auth.uid() = user_id);

DROP POLICY IF EXISTS plaza_requests_insert_own ON public.plaza_requests;
CREATE POLICY plaza_requests_insert_own ON public.plaza_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS plaza_discussions_insert_own ON public.plaza_discussions;
CREATE POLICY plaza_discussions_insert_own ON public.plaza_discussions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.plaza_requests IS 'Solicitudes de ofertas de la Plaza Aventa.';
COMMENT ON TABLE public.plaza_discussions IS 'Conversaciones de la Plaza Aventa.';
