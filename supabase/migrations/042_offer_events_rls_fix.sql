-- Auditoría: corregir RLS offer_events (due diligence)
-- 1) Eliminar INSERT anónimo (WITH CHECK true) y SELECT abierto (USING true).
-- 2) Solo INSERT authenticated con user_id = auth.uid() OR user_id IS NULL.
-- 3) SELECT solo filas propias (user_id = auth.uid()).

-- Quitar política que permite INSERT con (true) a anon/authenticated
DROP POLICY IF EXISTS "Allow insert for analytics" ON public.offer_events;
DROP POLICY IF EXISTS "offer_events_insert" ON public.offer_events;

-- Asegurar solo INSERT para authenticated con restricción
DROP POLICY IF EXISTS offer_events_insert_authenticated ON public.offer_events;
CREATE POLICY offer_events_insert_authenticated ON public.offer_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- Quitar SELECT que permite ver todos los eventos (USING true)
DROP POLICY IF EXISTS offer_events_select_authenticated ON public.offer_events;

-- Solo lectura de eventos propios (privacidad)
CREATE POLICY offer_events_select_own ON public.offer_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
