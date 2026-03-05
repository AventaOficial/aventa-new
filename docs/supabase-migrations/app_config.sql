-- Configuración global de la app (solo keys permitidas en código).
-- show_tester_offers: si true, el home muestra ofertas de ejemplo (solo relleno, no afectan métricas).

CREATE TABLE IF NOT EXISTS public.app_config (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT 'false'
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Lectura pública para que el home pueda saber si mostrar ofertas de testers.
DROP POLICY IF EXISTS "app_config_select_public" ON public.app_config;
CREATE POLICY "app_config_select_public" ON public.app_config
  FOR SELECT USING (true);

-- Inserts/updates solo vía service_role (API admin con requireOwner).
INSERT INTO public.app_config (key, value)
VALUES ('show_tester_offers', 'false')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.app_config IS 'Configuración de la app (ej. show_tester_offers para ofertas de ejemplo en home).';
