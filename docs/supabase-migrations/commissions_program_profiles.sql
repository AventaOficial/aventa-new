-- Programa de comisiones: aceptación explícita y versión de términos en perfil.
-- Ejecutar en Supabase SQL Editor cuando actives el programa en producción.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commissions_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS commissions_terms_version text NULL;

COMMENT ON COLUMN public.profiles.commissions_accepted_at IS
  'Momento en que el usuario aceptó los términos del programa de comisiones en la app.';
COMMENT ON COLUMN public.profiles.commissions_terms_version IS
  'Versión de términos aceptada (alineada con lib/commissions/constants.ts).';
