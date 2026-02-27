-- Añadir event_type 'share' para tracking de compartidos
ALTER TABLE public.offer_events DROP CONSTRAINT IF EXISTS offer_events_event_type_check;
ALTER TABLE public.offer_events ADD CONSTRAINT offer_events_event_type_check
  CHECK (event_type IN ('view', 'outbound', 'share'));
