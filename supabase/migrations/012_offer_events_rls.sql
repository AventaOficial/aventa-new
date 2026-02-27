-- RLS para offer_events: permitir INSERT con anon/authenticated (no service role)
ALTER TABLE public.offer_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow insert for analytics"
  ON public.offer_events FOR INSERT
  WITH CHECK (true);
