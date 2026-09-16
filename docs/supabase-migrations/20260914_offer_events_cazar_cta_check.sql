-- Ampliar offer_events.event_type para alinear schema con la app.
-- Causa: CHECK solo permitía view|outbound|share; /api/events y writeQueue también usan cazar_cta.
-- NO cambia view/outbound/share. NO toca rewards ni atribución.
-- Ejecutar en Supabase SQL Editor cuando se autorice (NO auto-aplicar).

ALTER TABLE public.offer_events
  DROP CONSTRAINT IF EXISTS offer_events_event_type_check;

ALTER TABLE public.offer_events
  ADD CONSTRAINT offer_events_event_type_check
  CHECK (event_type = ANY (ARRAY['view'::text, 'outbound'::text, 'share'::text, 'cazar_cta'::text]));

COMMENT ON CONSTRAINT offer_events_event_type_check ON public.offer_events IS
  'Tipos de telemetría permitidos: view, outbound, share, cazar_cta (CTA Ver oferta).';

-- Recuperación MANUAL post-migración (opcional, no ejecutar con esta migración sola):
-- Reencola jobs cazar_cta fallidos/pending para que /api/cron/process-write-queue los inserte.
-- UPDATE public.write_jobs_queue
-- SET status = 'pending',
--     attempts = 0,
--     error = NULL,
--     locked_at = NULL,
--     processed_at = NULL
-- WHERE job_type = 'offer_event'
--   AND payload->>'event_type' = 'cazar_cta'
--   AND status IN ('failed', 'pending');
