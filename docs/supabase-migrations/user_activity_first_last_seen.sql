-- Tabla para métricas de producto: first_seen y last_seen por usuario.
-- Se actualiza desde el cliente con POST /api/activity/heartbeat (autenticado).
-- Permite calcular: usuarios activos (last_seen reciente), retención 48h, mejor hora.

CREATE TABLE IF NOT EXISTS public.user_activity (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_last_seen ON public.user_activity (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_first_seen ON public.user_activity (first_seen_at DESC);

ALTER TABLE public.user_activity ENABLE ROW LEVEL SECURITY;

-- Solo el propio usuario puede insertar/actualizar su fila (first_seen_at no se sobrescribe).
DROP POLICY IF EXISTS "user_activity_own_upsert" ON public.user_activity;
CREATE POLICY "user_activity_own_upsert" ON public.user_activity
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Función para heartbeat: actualiza last_seen_at; si no existe la fila, inserta con first_seen_at y last_seen_at.
CREATE OR REPLACE FUNCTION public.upsert_user_activity(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_activity (user_id, first_seen_at, last_seen_at)
  VALUES (p_user_id, now(), now())
  ON CONFLICT (user_id) DO UPDATE SET last_seen_at = now();
END;
$$;

-- La API de métricas de producto usa service_role; no exponemos lectura a anon/authenticated.
COMMENT ON TABLE public.user_activity IS 'Primera y última actividad por usuario para métricas: retención 48h, activos, mejor hora.';
