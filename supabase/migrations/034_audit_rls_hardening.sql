-- Auditoría Supabase: endurecimiento RLS y políticas (proyecto AVENTA)
-- Ajustado al esquema real: tablas public.offers, offer_votes, comments, offer_events, offer_reports, moderation_logs, user_roles (columna role).
-- offer_votes ya tiene PRIMARY KEY (offer_id, user_id) en 002, no se añade UNIQUE extra.

-- ---------------------------------------------------------------------------
-- A. offer_votes: solo el dueño puede ver su voto; admins/owner pueden ver para moderación
-- Eliminar políticas que permitan lectura pública de votos (nombres posibles en DB)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow public read votes" ON public.offer_votes;
DROP POLICY IF EXISTS "offer_votes_no_read" ON public.offer_votes;

CREATE POLICY offer_votes_select_own_or_admin ON public.offer_votes
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid())
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'owner')
    ))
  );

-- ---------------------------------------------------------------------------
-- B. offer_events: no permitir INSERT anónimo (evitar spoofing de métricas)
-- La API usa service_role y no se ve afectada por RLS; esto bloquea uso directo desde cliente.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert for analytics" ON public.offer_events;

CREATE POLICY offer_events_insert_authenticated ON public.offer_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- ---------------------------------------------------------------------------
-- C. comments: lectura solo para comentarios de ofertas visibles (approved/published, no expiradas)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Cualquiera puede leer comentarios" ON public.comments;

CREATE POLICY comments_select_on_offer_visibility ON public.comments
  FOR SELECT TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = comments.offer_id
        AND o.status IN ('approved', 'published')
        AND (o.expires_at IS NULL OR o.expires_at > now())
    )
  );

-- ---------------------------------------------------------------------------
-- D. offer_reports: INSERT ya correcto (reporter_id = auth.uid()). SELECT solo moderadores/admin/owner
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Moderadores pueden ver reportes" ON public.offer_reports;

CREATE POLICY offer_reports_select_moderators ON public.offer_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('moderator', 'admin', 'owner')
    )
  );

-- ---------------------------------------------------------------------------
-- E. moderation_logs: solo admin/moderator/owner pueden leer e insertar
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin puede leer logs" ON public.moderation_logs;
DROP POLICY IF EXISTS "Admin puede insertar logs" ON public.moderation_logs;

CREATE POLICY moderation_logs_select_moderators ON public.moderation_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('moderator', 'admin', 'owner')
    )
  );

CREATE POLICY moderation_logs_insert_moderators ON public.moderation_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('moderator', 'admin', 'owner')
    )
  );

-- ---------------------------------------------------------------------------
-- F. offers: RLS y políticas SELECT (anon ve solo aprobadas; authenticated ve propias + visibles + admin)
-- ---------------------------------------------------------------------------
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_can_select_offers_moderation" ON public.offers;
DROP POLICY IF EXISTS "anon_can_select_approved_offers" ON public.offers;

CREATE POLICY offers_select_anon ON public.offers
  FOR SELECT TO anon
  USING (
    status IN ('approved', 'published')
    AND (expires_at IS NULL OR expires_at > now())
  );

CREATE POLICY offers_select_authenticated ON public.offers
  FOR SELECT TO authenticated
  USING (
    (status IN ('approved', 'published') AND (expires_at IS NULL OR expires_at > now()))
    OR (created_by = auth.uid())
    OR (EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'moderator', 'owner')
    ))
  );

-- ---------------------------------------------------------------------------
-- G. Índices recomendados (IF NOT EXISTS para no fallar si ya existen)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_offers_status_created_at ON public.offers (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_created_by_created_at ON public.offers (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_votes_offer_created_at ON public.offer_votes (offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_offer_created_at ON public.comments (offer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_created_at ON public.comments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_events_offer_event_created_at ON public.offer_events (offer_id, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_logs_offer_created_at ON public.moderation_logs (offer_id, created_at DESC);

-- ranking_momentum puede existir ya (033); se evita error con IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_offers_ranking_momentum ON public.offers (ranking_momentum DESC, updated_at DESC);
