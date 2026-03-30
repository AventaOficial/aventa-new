-- Agregación de eventos por oferta (para panel del creador: vistas, compartidos, clics en Cazar).
-- Ejecutar en Supabase SQL Editor si quieres evitar N consultas COUNT desde la API.
--
-- Requisito: `offer_events.event_type` acepte el valor 'cazar_cta' (TEXT o ENUM ampliado).

CREATE OR REPLACE FUNCTION public.offer_event_counts_for_offers(p_offer_ids uuid[])
RETURNS TABLE (offer_id uuid, event_type text, ct bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.offer_id, e.event_type::text, count(*)::bigint
  FROM public.offer_events e
  WHERE e.offer_id = ANY(p_offer_ids)
    AND e.event_type::text IN ('view', 'share', 'cazar_cta')
  GROUP BY e.offer_id, e.event_type;
$$;

COMMENT ON FUNCTION public.offer_event_counts_for_offers(uuid[]) IS 'Conteos offer_events por oferta y tipo (view, share, cazar_cta) para /api/me/offer-metrics.';

GRANT EXECUTE ON FUNCTION public.offer_event_counts_for_offers(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.offer_event_counts_for_offers(uuid[]) TO service_role;
