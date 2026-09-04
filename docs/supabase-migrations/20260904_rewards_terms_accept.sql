-- Programa de Recompensas: aceptación explícita de términos (sección 8) al elegir Oferta de Bienvenida.
-- Ejecutar en Supabase SQL Editor (aditivo, seguro si ya existe).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS rewards_terms_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS rewards_terms_version text NULL;

COMMENT ON COLUMN public.profiles.rewards_terms_accepted_at IS
  'Momento en que el usuario aceptó los términos del Programa de Recompensas (sección 8) al elegir Oferta de Bienvenida.';
COMMENT ON COLUMN public.profiles.rewards_terms_version IS
  'Versión de términos aceptada (alineada con REWARDS_TERMS_VERSION en lib/rewards/config.ts).';
