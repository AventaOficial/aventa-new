-- Índices en offers para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_offers_status ON public.offers (status);
CREATE INDEX IF NOT EXISTS idx_offers_expires_at ON public.offers (expires_at);
CREATE INDEX IF NOT EXISTS idx_offers_ranking_momentum ON public.offers (ranking_momentum);
CREATE INDEX IF NOT EXISTS idx_offers_created_at ON public.offers (created_at);

-- Revocar EXECUTE en funciones SECURITY DEFINER (solo triggers/backend deben usarlas)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_offer_metrics(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_offers_submitted_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_offers_approved_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_offers_rejected_count(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_display_name_change_limit() FROM anon, authenticated;
