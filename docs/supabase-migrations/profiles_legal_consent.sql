-- Consentimiento de Términos/Privacidad en registro y solicitudes de eliminación de cuenta.
-- Ejecutar en Supabase SQL Editor antes de desplegar el flujo de registro con consentimiento.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS legal_consent_version text NULL,
  ADD COLUMN IF NOT EXISTS account_deletion_requested_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'Momento en que el usuario aceptó los Términos y Condiciones vigentes.';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS
  'Momento en que el usuario aceptó la Política de Privacidad vigente.';
COMMENT ON COLUMN public.profiles.legal_consent_version IS
  'Versión del paquete legal aceptado (LEGAL_CONSENT_VERSION en app).';
COMMENT ON COLUMN public.profiles.account_deletion_requested_at IS
  'Solicitud de eliminación de cuenta iniciada por el usuario desde Configuración.';
