-- Notificaciones in-app y preferencias de correo (resumen diario/semanal).
-- Ejecutar en Supabase SQL Editor.

-- 1) Notificaciones in-app (campana)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications(user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_notifications" ON public.notifications;
CREATE POLICY "users_own_notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);

-- 2) Preferencias de correo (resumen diario y semanal)
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  email_daily_digest boolean NOT NULL DEFAULT false,
  email_weekly_digest boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_email_preferences ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_email_prefs" ON public.user_email_preferences;
CREATE POLICY "users_own_email_prefs" ON public.user_email_preferences
  FOR ALL USING (auth.uid() = user_id);

COMMENT ON TABLE public.notifications IS 'Notificaciones in-app (campana): oferta aprobada, comentario, destacada, etc.';
COMMENT ON TABLE public.user_email_preferences IS 'Preferencias de correo: resumen diario (top 10), resumen semanal (domingo).';
