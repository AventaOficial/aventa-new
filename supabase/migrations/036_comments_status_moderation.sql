-- Comentarios pasan por moderación: solo se muestran los aprobados

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_comments_status ON public.comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_offer_status ON public.comments(offer_id, status);

-- Quitar políticas de lectura previas
DROP POLICY IF EXISTS "Cualquiera puede leer comentarios" ON public.comments;
DROP POLICY IF EXISTS comments_select_on_offer_visibility ON public.comments;

-- Solo leer comentarios aprobados de ofertas visibles
CREATE POLICY comments_select_approved_on_visible_offer ON public.comments
  FOR SELECT TO public
  USING (
    status = 'approved'
    AND EXISTS (
      SELECT 1 FROM public.offers o
      WHERE o.id = comments.offer_id
        AND o.status IN ('approved', 'published')
        AND (o.expires_at IS NULL OR o.expires_at > now())
    )
  );

-- Moderadores pueden ver todos (pending, approved, rejected) para moderar
CREATE POLICY comments_select_moderators ON public.comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role IN ('moderator', 'admin', 'owner')
    )
  );

-- Moderadores pueden actualizar status
CREATE POLICY comments_update_moderators ON public.comments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('moderator', 'admin', 'owner'))
  )
  WITH CHECK (true);

COMMENT ON COLUMN public.comments.status IS 'pending: en revisión; approved: visible; rejected: oculto';
