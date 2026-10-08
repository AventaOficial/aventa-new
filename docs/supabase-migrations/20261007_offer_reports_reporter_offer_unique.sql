-- Un usuario, una oferta. El API ya rechaza el duplicado; el índice cierra la carrera.
-- No cambia el catálogo de reportes ni abre escrituras al cliente.

CREATE UNIQUE INDEX IF NOT EXISTS offer_reports_reporter_offer_uidx
  ON public.offer_reports (reporter_id, offer_id);
