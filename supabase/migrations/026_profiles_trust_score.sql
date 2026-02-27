-- Fase 4: user_trust_score en perfiles

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS user_trust_score integer 
  CHECK (user_trust_score IS NULL OR (user_trust_score >= 0 AND user_trust_score <= 100));

-- Valor por defecto para usuarios nuevos
COMMENT ON COLUMN public.profiles.user_trust_score IS '0-100. Afecta visibilidad, peso de reportes, límites.';
