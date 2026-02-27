-- Fase 2: risk_score y rejection_reason en ofertas

-- risk_score: 0-100, mayor = más riesgo
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS risk_score integer CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100));

-- rejection_reason: motivo de rechazo (opcional)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Índice para filtrar por risk
CREATE INDEX IF NOT EXISTS idx_offers_risk_score ON public.offers(risk_score) WHERE risk_score IS NOT NULL;

-- Función básica para calcular risk_score (0-100)
-- Factores: título similar, precio sospechoso, usuario con muchas ofertas
CREATE OR REPLACE FUNCTION public.compute_offer_risk_score(p_offer_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  score integer := 0;
  r record;
  similar_count integer;
  user_offers_count integer;
BEGIN
  SELECT o.title, o.price, o.original_price, o.created_by
  INTO r
  FROM public.offers o
  WHERE o.id = p_offer_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Factor 1: títulos con substring común (primeras 15 chars)
  IF length(r.title) >= 10 THEN
    SELECT COUNT(*)::int INTO similar_count
    FROM public.offers o2
    WHERE o2.id != p_offer_id
      AND o2.created_at >= now() - interval '7 days'
      AND (o2.status = 'approved' OR o2.status = 'published')
      AND length(o2.title) >= 10
      AND (o2.title ILIKE '%' || left(trim(r.title), 15) || '%' OR r.title ILIKE '%' || left(trim(o2.title), 15) || '%');
  ELSE
    similar_count := 0;
  END IF;

  IF similar_count > 0 THEN score := score + 15; END IF;
  IF similar_count > 2 THEN score := score + 20; END IF;

  -- Factor 2: precio original <= precio actual (sospechoso)
  IF r.original_price IS NOT NULL AND r.original_price <= r.price THEN
    score := score + 30;
  END IF;

  -- Factor 3: usuario con muchas ofertas en 24h
  IF r.created_by IS NOT NULL THEN
    SELECT COUNT(*)::int INTO user_offers_count
    FROM public.offers o3
    WHERE o3.created_by = r.created_by
      AND o3.created_at >= now() - interval '24 hours';
    IF user_offers_count > 5 THEN score := score + 35; END IF;
  END IF;

  RETURN LEAST(100, score);
END;
$$;

-- Trigger: calcular risk_score después de insertar
CREATE OR REPLACE FUNCTION public.trigger_compute_risk_score()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    UPDATE public.offers
    SET risk_score = public.compute_offer_risk_score(NEW.id)
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_compute_risk_score ON public.offers;
CREATE TRIGGER trg_compute_risk_score
  AFTER INSERT ON public.offers
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_compute_risk_score();

