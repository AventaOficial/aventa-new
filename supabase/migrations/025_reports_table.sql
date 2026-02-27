-- Fase 3: Sistema de reportes estructurados

CREATE TABLE IF NOT EXISTS public.offer_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES public.offers(id) ON DELETE CASCADE,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN (
    'precio_falso', 'no_es_oferta', 'expirada', 'spam', 'afiliado_oculto', 'otro'
  )),
  comment TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_reports_offer ON public.offer_reports(offer_id);
CREATE INDEX IF NOT EXISTS idx_offer_reports_status ON public.offer_reports(status);

ALTER TABLE public.offer_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios pueden reportar" ON public.offer_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "Moderadores pueden ver reportes" ON public.offer_reports
  FOR SELECT USING (true);
