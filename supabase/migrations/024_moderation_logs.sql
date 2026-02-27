-- Fase 3: Logs de moderación y auditoría

CREATE TABLE IF NOT EXISTS public.moderation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'approved', 'rejected', 'status_change'
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_moderation_logs_offer ON public.moderation_logs(offer_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_user ON public.moderation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_created ON public.moderation_logs(created_at DESC);

ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

-- Solo service_role o usuarios con rol pueden insertar/leer
CREATE POLICY "Admin puede leer logs" ON public.moderation_logs
  FOR SELECT USING (true);

CREATE POLICY "Admin puede insertar logs" ON public.moderation_logs
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.moderation_logs IS 'Log de cambios de estado en moderación';
