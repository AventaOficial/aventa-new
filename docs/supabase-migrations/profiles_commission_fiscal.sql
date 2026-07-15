-- Datos fiscales para pagos del programa de comisiones (cazadores elegibles).
-- Ejecutar en Supabase SQL Editor junto con commissions_program_profiles.sql.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commission_legal_name text NULL,
  ADD COLUMN IF NOT EXISTS commission_rfc text NULL,
  ADD COLUMN IF NOT EXISTS commission_clabe text NULL,
  ADD COLUMN IF NOT EXISTS commission_fiscal_updated_at timestamptz NULL;

COMMENT ON COLUMN public.profiles.commission_legal_name IS
  'Nombre legal del titular para pagos de comisiones (como en constancia fiscal).';
COMMENT ON COLUMN public.profiles.commission_rfc IS
  'RFC normalizado (12-13 caracteres) para retenciones y CFDI. Único entre perfiles activos en comisiones.';
COMMENT ON COLUMN public.profiles.commission_clabe IS
  'CLABE interbancaria 18 dígitos (opcional pero recomendada para transferencia).';
COMMENT ON COLUMN public.profiles.commission_fiscal_updated_at IS
  'Última actualización de datos fiscales del programa de comisiones.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_commission_rfc_unique
  ON public.profiles (upper(commission_rfc))
  WHERE commission_rfc IS NOT NULL AND btrim(commission_rfc) <> '';
