-- Acquisition Network v1.
--
-- hunter_offer_candidates.source es la tienda/canal del Hunter (amazon_mx, …).
-- Reutilizarla como fuente de adquisición mezclaría "de dónde se leyó el producto"
-- con "quién lo encontró". evidence puede guardar la atribución, pero un scout
-- y una fuente activa necesitan identidad propia: nombre, tipo y activo.
--
-- El candidato sigue viviendo en hunter_offer_candidates.
-- run_id de un envío usa el prefijo acq: para no pisar un run del Hunter.
-- El índice abierto de offer_batch_items sigue siendo la autoridad de producto.

CREATE TABLE IF NOT EXISTS public.acquisition_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN ('automated', 'human', 'internal', 'external')),
  display_name text NOT NULL,
  description text NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.acquisition_scouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES public.acquisition_sources(id),
  display_name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, display_name)
);

CREATE INDEX IF NOT EXISTS hunter_offer_candidates_acquisition_source_idx
  ON public.hunter_offer_candidates ((evidence #>> '{acquisition,source_key}'), discovered_at DESC)
  WHERE evidence #>> '{acquisition,source_key}' IS NOT NULL;

INSERT INTO public.acquisition_sources (source_key, source_type, display_name, description)
VALUES
  ('chatgpt_deal_hunter', 'automated', 'ChatGPT Deal Hunter', 'Tareas de ChatGPT que buscan ofertas.'),
  ('chatgpt_everyday', 'automated', 'ChatGPT Everyday', 'Tareas de ChatGPT de compra cotidiana.'),
  ('chatgpt_promotions', 'automated', 'ChatGPT Promotions', 'Tareas de ChatGPT de promociones.'),
  ('human_scout', 'human', 'Scout humano', 'Personas que entregan URLs. No publican.'),
  ('admin_manual', 'internal', 'Admin manual', 'Staff pega URLs al ledger de adquisición.')
ON CONFLICT (source_key) DO NOTHING;

ALTER TABLE public.acquisition_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acquisition_scouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.acquisition_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.acquisition_scouts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.acquisition_sources TO service_role;
GRANT ALL ON TABLE public.acquisition_scouts TO service_role;
GRANT SELECT ON TABLE public.acquisition_sources TO authenticated;
GRANT SELECT ON TABLE public.acquisition_scouts TO authenticated;

DROP POLICY IF EXISTS acquisition_sources_select_staff ON public.acquisition_sources;
CREATE POLICY acquisition_sources_select_staff
  ON public.acquisition_sources FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

DROP POLICY IF EXISTS acquisition_scouts_select_staff ON public.acquisition_scouts;
CREATE POLICY acquisition_scouts_select_staff
  ON public.acquisition_scouts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'moderator'::text])
    )
  );

COMMENT ON TABLE public.acquisition_sources IS
  'Fuentes de Acquisition Network. No publican ofertas.';
COMMENT ON TABLE public.acquisition_scouts IS
  'Identidad de quien entrega URLs. No es usuario comunitario ni puede publicar.';
