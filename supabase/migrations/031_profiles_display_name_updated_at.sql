-- Límite de cambio de nombre: una vez cada 14 días
-- display_name_updated_at: última vez que el usuario cambió su nombre visible

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name_updated_at timestamptz DEFAULT now();

-- Si la columna ya existía, no sobrescribir valores; si es nueva, now() es correcto para perfiles existentes
COMMENT ON COLUMN public.profiles.display_name_updated_at IS 'Última actualización del nombre visible; usado para límite de 14 días entre cambios';
