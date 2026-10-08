-- hunter_intent: abrir el envío canónico cuando el usuario todavía no tiene ofertas.
-- No es un envío. No sustituye offers. Idempotente. No aplicar en producción en esta fase.

ALTER TABLE public.product_events DROP CONSTRAINT IF EXISTS product_events_event_name_check;

ALTER TABLE public.product_events
  ADD CONSTRAINT product_events_event_name_check
  CHECK (event_name IN (
    'page_view',
    'feed_view',
    'search',
    'load_more',
    'offer_view',
    'offer_click',
    'outbound_click',
    'vote',
    'save',
    'comment',
    'submission',
    'signup',
    'login',
    'hunter_intent'
  )) NOT VALID;
